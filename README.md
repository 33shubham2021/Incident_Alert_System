# AlertMap — Incident Alert System
## Technical Design Document (TDD / HLD + LLD)

**Version:** 1.0  
**Audience:** Senior Backend Engineers, Architects, Platform Engineers  
**Domain:** `test.rohitaman.com`  
**Status:** Production Deployed

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack Analysis](#2-tech-stack-analysis)
3. [System Architecture](#3-system-architecture)
4. [High Level Design](#4-high-level-design)
5. [Authentication and Authorization](#5-authentication-and-authorization)
6. [Messaging, Event-Driven Architecture and Cache](#6-messaging-event-driven-architecture-and-cache)
7. [Scalability Analysis](#7-scalability-analysis)
8. [DevOps and Deployment](#8-devops-and-deployment)
9. [Executive Summary](#9-executive-summary)
10. [Strengths and Weaknesses](#10-strengths-and-weaknesses)
11. [Future Scope](#11-future-scope)

---

## 1. Project Overview

### 1.1 What Is AlertMap?

AlertMap is a **real-time geospatial incident notification system**. Users subscribe to geographic coordinates of interest — a home, workplace, or any location they care about — and receive **SMS alerts** whenever a qualifying incident (traffic jam, road closure, accident, climate hazard) occurs within their configured radius.

The system ingests alerts from a third-party provider, normalizes them into a canonical alert schema, persists them in a relational database, and fans them out to subscribers via an event-driven Kafka pipeline with Redis-backed geospatial matching.

### 1.2 Core User Journey

```
  User registers  →  subscribes to a location  →  incident occurs nearby
       ↓
  Kafka consumer matches alert to subscriptions  →  SMS delivered to user
```

### 1.3 Design Goals

- **Sub-second alert fan-out** — Kafka consumer processes alerts asynchronously; Redis GEO index handles subscription matching without polling the database on every alert.
- **Geospatial efficiency** — Redis `GEOSEARCH` provides O(log n) proximity lookup, avoiding a full table scan of the `subscription` table for every incoming alert.
- **Service isolation** — Three independently deployable microservices: `auth_server` (identity), `api_server` (alerts + subscriptions + Kafka), and `frontend` (SPA). Each can be updated, restarted, or scaled without affecting the others.
- **Durability** — Redis uses AOF + RDB dual persistence so the geo-index survives crashes. MySQL runs on AWS RDS with managed backups and Multi-AZ capability.
- **Simple ops** — The entire stack runs from a single `docker-compose up` command behind a host Nginx reverse proxy. No Kubernetes or external orchestration required at this scale.

### 1.4 Repository Layout

```
Incident_Alert_System/
├── auth_server/              # Microservice: user registration and login
│   ├── config/db.js
│   ├── controllers/authController.js
│   ├── models/User.js
│   ├── repositories/userRepository.js
│   ├── routes/authRoutes.js
│   ├── services/tokenGenerationService.js
│   ├── server.js             # dev entry point
│   └── .env.dummy
│
├── api_server/               # Microservice: alerts, subscriptions, Kafka, scheduler
│   ├── config/db.js
│   ├── config/redisClient.js
│   ├── controllers/
│   │   ├── alertController.js
│   │   └── subscriptionController.js
│   ├── kafka/
│   │   ├── producer.js
│   │   └── consumer.js
│   ├── models/
│   │   ├── Alert.js
│   │   └── Subscription.js
│   ├── repositories/
│   │   ├── alertRepository.js
│   │   ├── subscriptionRepository.js
│   │   ├── userRepository.js
│   │   └── redisRepository.js
│   ├── routes/alertRoutes.js
│   ├── services/
│   │   ├── schedulerService.js
│   │   └── smsService.js
│   ├── server.js
│   └── .env.dummy
│
├── frontend/                 # React 18 SPA with Leaflet maps
│   ├── src/
│   │   ├── App.jsx
│   │   ├── config.js         # API base URLs (env-specific)
│   │   ├── context/AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   └── DashboardPage.jsx
│   │   ├── components/
│   │   │   ├── LoginMap.jsx
│   │   │   ├── DashMap.jsx
│   │   │   └── RegisterModal.jsx
│   │   └── services/
│   │       ├── api.js
│   │       └── alertService.js
│   └── vite.config.js
│
├── Production/               # All production deployment artifacts
│   ├── docker-compose.yml
│   ├── nginx/nginx.conf      # Host-level reverse proxy
│   ├── auth_server/
│   │   ├── Dockerfile
│   │   └── server.prod.js
│   ├── api_server/
│   │   ├── Dockerfile
│   │   └── server.prod.js
│   ├── frontend/
│   │   ├── Dockerfile
│   │   ├── config.prod.js
│   │   ├── App.prod.jsx
│   │   └── nginx.conf        # Container nginx for /alert-system/
│   └── redis/
│       ├── Dockerfile
│       └── redis.conf
│
└── sqls/
    └── Registration_Login.sql
```

---

## 2. Tech Stack Analysis

### 2.1 Runtime and Backend

- **Node.js 20-alpine** — Runtime for both backend services. The non-blocking event loop handles concurrent Kafka message processing, Redis queries, and HTTP requests without thread management overhead. Alpine base keeps container images lean.
- **Express.js 5.2.1** — HTTP framework for both `auth_server` and `api_server`. Minimal surface area; middleware-based pipeline for CORS, JSON parsing, and routing.
- **bcryptjs 3.0.3** — Pure-JavaScript bcrypt implementation for password hashing (SALT_ROUNDS = 10). Chosen over native `bcrypt` to avoid native addon compilation in Alpine images.
- **jsonwebtoken 9.0.3** — HS256 JWT signing and verification for session tokens issued by `auth_server`.
- **node-cron 3.0.3** — In-process cron scheduler that triggers the alert ingestion cycle. Runs inside the `api_server` process; no external job runner needed.
- **kafkajs 2.x** — Pure-JavaScript Kafka producer and consumer client. KRaft-compatible (no Zookeeper API dependencies). Used for publishing alerts from the scheduler and consuming them in the fan-out pipeline.
- **node-redis v5** — Redis client with native Promise API. Supports `GEOSEARCH`, `GEOADD`, `HSET`, `ZREM` commands used by the subscription and geo-index layers.
- **mysql2 3.x** — Promise-based MySQL client with connection pooling. Used by both services for all relational data access.

### 2.2 Data Layer

- **MySQL 8.0 on AWS RDS** — Primary relational store. Owns the `user`, `alert`, and `subscription` tables. RDS provides managed backups, Multi-AZ failover, and automated minor version patching.
- **Redis 7.0+ (Geospatial Index)** — The `subscriptions_geo` sorted set stores all active subscriptions as geo-encoded members. Used by the Kafka consumer to find subscriptions within a configurable radius of each incoming alert in O(log n) time.
- **Redis 7.0+ (Metadata Hash)** — Per-subscription hash keys (`sub_meta:{member}`) store the user's configured notification radius (km), mobile number, and coordinates. Looked up per candidate during alert fan-out to apply the user's exact distance threshold.
- **Apache Kafka 4.1.1** — Message queue for the alert notification pipeline. Decouples alert ingestion (scheduler writes) from subscriber fan-out (consumer reads), ensuring the scheduler is never blocked by slow SMS delivery or Redis query time.

### 2.3 Infrastructure

- **Docker Compose 3.9** — Orchestrates all five containers (Redis, Kafka, auth_server, api_server, frontend) on a single VM. Service dependencies are explicit: `api_server` waits for Redis to pass its healthcheck and for Kafka to start before launching.
- **Nginx (host-installed) — Reverse Proxy** — Sits outside Docker on the host. Handles TLS termination via Certbot, and routes incoming HTTPS traffic by path prefix: `/alert-system/` → frontend container, `/api/` → api_server, `/auth/` → auth_server.
- **Nginx (stable-alpine) — Container Web Server** — Runs inside the frontend container to serve the Vite-built static SPA. Configured to serve all assets under the `/alert-system/` subpath, matching the `--base=/alert-system/` Vite build flag.
- **Kafka in KRaft Mode** — Kafka runs without Zookeeper by using the built-in KRaft consensus protocol (`KAFKA_PROCESS_ROLES: broker,controller`). This eliminates an additional stateful dependency and reduces operational complexity on a single-VM deployment.
- **Redis AOF + RDB Persistence** — Redis is configured with `appendonly yes` and `appendfsync everysec` (AOF) combined with `save 60 1000` (RDB snapshot). AOF ensures at most one second of geo-index writes are lost on crash; RDB provides a faster baseline for restore.

### 2.4 Frontend

- **React 18.3.1** — Component-based UI framework. The app has two primary pages: `LoginPage` (split-panel map + auth form) and `DashboardPage` (user profile, subscription management, live map). State is managed at the component level with a single shared `AuthContext` for JWT token storage.
- **React Router 6.28.0** — Client-side routing with two routes: `/` (login) and `/dashboard` (protected). In production, the router is initialized with `basename="/alert-system/"` to match the Nginx subpath.
- **Leaflet 1.9.4** — Renders interactive maps using OpenStreetMap tiles. Used on both the login page (full-screen background map with alert markers and a live ticker) and the dashboard (compact alert visualization). Supports marker clusters, popups, and layer switching.
- **Vite 6.0.7** — Build toolchain for the React SPA. In development it provides a fast HMR dev server on port 5173. In production it compiles and tree-shakes to static assets in `dist/`, built with `--base=/alert-system/` so all asset paths are subpath-relative.
- **Nominatim (OpenStreetMap)** — Free public geocoding API used for two purposes: forward geocoding a user-typed place name to lat/lon coordinates when adding a subscription, and reverse geocoding stored lat/lon back to a human-readable address for display in the subscriptions list.

---

## 3. System Architecture

### 3.1 Component Overview

```
                              Internet
                                 │
                    ┌────────────▼────────────┐
                    │   Host Nginx (port 443)  │
                    │   SSL Termination        │
                    │   test.com     │
                    └──────────┬──────────────┘
                               │  Path-based routing
          ┌────────────────────┼──────────────────────┐
          │                    │                       │
          ▼                    ▼                       ▼
  /alert-system/           /api/*                 /auth/*
 :8080 (frontend)      :5051 (api_server)    :5050 (auth_server)
          │                    │                       │
          │            ┌───────┴───────┐               │
          │            │               │               │
          │         Kafka          Redis GEO            │
          │        :9092           :6379               │
          │            │               │               │
          │            └───────┬───────┘               │
          │                    │                       │
          └────────────────────┼───────────────────────┘
                               │
                     ┌─────────▼────────┐
                     │   MySQL (RDS)    │
                     │   :3306          │
                     │   alert_system   │
                     └──────────────────┘
```

### 3.2 Microservice Boundaries

The system is split into three independently deployable services:

```
┌──────────────────────────────────────────────────────────────────┐
│  auth_server  (Port 5050)                                        │
│  ─────────────────────────────────────────────────────────────   │
│  Owns: user registration, login, JWT issuance                    │
│  DB tables: user                                                 │
│  No Kafka, No Redis                                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  api_server  (Port 5051)                                         │
│  ─────────────────────────────────────────────────────────────   │
│  Owns: alert ingestion, subscription management, notification    │
│  DB tables: alert, subscription, user (read-only)               │
│  Kafka: producer + consumer                                      │
│  Redis: GEO index + metadata hashes                              │
│  Cron: alert ingestion scheduler (every 30 min)                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  frontend  (Port 8080 → host Nginx → :443)                       │
│  ─────────────────────────────────────────────────────────────   │
│  React 18 SPA, served as static files by Nginx in container      │
│  Communicates with api_server and auth_server via fetch()        │
│  No server-side logic; fully client-rendered                     │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Network Topology (Docker)

All containers share the `alertmap-net` bridge network. Only app services expose ports to `127.0.0.1` (loopback). Kafka and Redis are not exposed externally.

```
alertmap-net (bridge)
  ├── alertmap-redis      :6379   (internal only)
  ├── alertmap-kafka      :9092   (internal only)
  ├── alertmap-auth       :5050   → 127.0.0.1:5050
  ├── alertmap-api        :5051   → 127.0.0.1:5051
  └── alertmap-frontend   :80     → 127.0.0.1:8080
```

Host Nginx sits outside Docker and reverse-proxies from public HTTPS into the loopback ports.

---

## 4. High Level Design

### 4.1 Database Schema (ERD)

```
┌─────────────────────────────────┐
│            user                 │
├─────────────────────────────────┤
│ PK  user_id        INT AI       │
│     name           VARCHAR(255) │
│     email          VARCHAR(255) │
│ UQ  mobile_number  VARCHAR(20)  │  ← primary identifier for SMS
│     password       VARCHAR(255) │  ← bcrypt hash
│     created_at     TIMESTAMP    │
└─────────────┬───────────────────┘
              │  1
              │  FK: subscription.mobile_number → user.mobile_number
              │  ON DELETE CASCADE
              │  N
┌─────────────▼───────────────────┐
│          subscription           │
├─────────────────────────────────┤
│ PK  id             INT AI       │
│ FK  mobile_number  VARCHAR(20)  │
│     latitude       DECIMAL(10,8)│
│     longitude      DECIMAL(11,8)│
│     distance       INT (km)     │  ← user-configured notification radius
│     created_at     TIMESTAMP    │
│ UQ  (mobile_number, lat, lon)   │  ← prevents duplicate subscriptions
└─────────────────────────────────┘

┌─────────────────────────────────┐
│             alert               │
├─────────────────────────────────┤
│ PK  id             INT AI       │
│     latitude       DECIMAL(10,8)│
│     longitude      DECIMAL(11,8)│
│     alert_type     ENUM(        │
│                    TRAFFIC,     │
│                    CLIMATE,     │
│                    CLOSURE,     │
│                    ACCIDENT)    │
│     description    VARCHAR(512) │
│     created_at     TIMESTAMP    │  ← indexed for time-window queries
└─────────────────────────────────┘
```

**Design choices:**
- `mobile_number` is the FK in `subscription` (not `user_id`) because the SMS delivery pipeline keys on mobile number. This avoids an extra join from `subscription → user` inside the Kafka consumer's hot path.
- `DECIMAL(10,8)` / `DECIMAL(11,8)` stores lat/lon with 8 decimal places (~1 mm precision), sufficient for street-level accuracy.
- `ENUM` on `alert_type` constrains values at the DB layer, not just the application layer, and enables efficient index filtering.
- The composite unique key `uq_sub (mobile_number, latitude, longitude)` prevents the same user from subscribing to the exact same coordinate twice.

### 4.2 API Contracts

#### Auth Server — `POST /auth/register`

```
Request:
  { "name": "Shubham", "email": "s@example.com",
    "mobile_number": "+91-9999999999", "password": "secret123" }

Response 201:
  { "message": "User registered successfully." }

Response 409:
  { "message": "Mobile number is already registered." }
```

#### Auth Server — `POST /auth/login`

```
Request:
  { "mobile_number": "+91-9999999999", "password": "secret123" }

Response 200:
  { "token": "<jwt>" }
  JWT payload: { userId, mobileNumber, name, email, iat, exp }

Response 401:
  { "message": "Invalid credentials." }
```

#### API Server — Alert Endpoints

```
GET /api/alerts?minutes=60
Response 200:
  { "window_minutes": 60, "count": 5,
    "alerts": [ { id, latitude, longitude, alert_type, description, created_at } ] }
```

#### API Server — Subscription Endpoints

```
POST /api/add-subscription
  Body: { mobile_number, latitude, longitude, distance }
  → 201: { message, subscription: { id, mobile_number, latitude, longitude, distance } }
  → 409: duplicate
  → 404: user not found

GET /api/get-subscriptions?mobile_number=xxx
  → 200: { mobile_number, count, subscriptions: [...] }

DELETE /api/delete-subscription
  Body: { mobile_number, latitude, longitude }
  → 200: { message: "Subscription deleted successfully." }
  → 404: not found

GET /api/get-user?mobile_number=xxx
  → 200: { user: { user_id, name, email, mobile_number, created_at } }

POST /api/dummy-test
  Body: { latitude, longitude }
  → 201: { message, alert: { id, latitude, longitude, alertType, description } }
```

### 4.3 Alert Ingestion Pipeline (Third-Party API Integration)

The scheduler service is the alert ingestion entry point. In the current codebase it seeds synthetic data for development; in production it will call a real third-party incident data provider. The pipeline below describes the **production-intended** architecture.

**Recommended providers for India (choose one):**
- **HERE Traffic API** — incidents feed for India with TRAFFIC / CLOSURE / ACCIDENT categorization
- **TomTom Traffic Incidents API** — real-time incidents with severity, geometry, and description
- **NDMA / IMD Open Data** — for CLIMATE-type alerts (floods, cyclones, heatwaves)

```
        ┌─────────────────────────────────────────────────────────┐
        │               schedulerService.js  (node-cron)          │
        │               Runs every 30 minutes                     │
        └────────────────────────┬────────────────────────────────┘
                                 │
                    Step 1: Call third-party API
                                 │
          ┌──────────────────────▼──────────────────────┐
          │        HERE Traffic / TomTom API             │
          │  GET /v7/incidents?in=circle:<lat>,<lon>     │
          │                     :radius=500km            │
          │  Auth: API Key in header                     │
          └──────────────────────┬──────────────────────┘
                                 │
                   Step 2: Normalize to internal schema
                                 │
          ┌──────────────────────▼──────────────────────┐
          │  Normalization Layer (inside schedulerService)│
          │                                              │
          │  provider.type  →  alert_type ENUM          │
          │   "TRAFFIC_JAM" → "TRAFFIC"                 │
          │   "ROAD_CLOSED" → "CLOSURE"                 │
          │   "ACCIDENT"    → "ACCIDENT"                 │
          │   "WEATHER"     → "CLIMATE"                  │
          │                                              │
          │  Extract: lat, lon, description, severity    │
          │  Filter:  only severity >= threshold         │
          │  Dedupe:  skip alerts already in DB          │
          │           (by provider_incident_id)          │
          └──────────────────────┬──────────────────────┘
                                 │
             Step 3: Batch insert into MySQL alert table
                                 │
          ┌──────────────────────▼──────────────────────┐
          │  alertRepository.createAlert(alert)          │
          │  INSERT INTO alert (lat, lon, type, desc)    │
          └──────────────────────┬──────────────────────┘
                                 │
          Step 4: Publish each inserted alert to Kafka
                                 │
          ┌──────────────────────▼──────────────────────┐
          │  kafkaProducer.publishAlert(alert)           │
          │  Topic: alert_subscriptions                  │
          └──────────────────────────────────────────────┘
```

**Deduplication strategy** (production): add a `provider_incident_id VARCHAR(128) UNIQUE` column to the `alert` table. Before inserting, query by `provider_incident_id`; skip if already present. This makes the scheduler idempotent across retries and overlapping API poll windows.

**Error handling** (production):
- API call timeout: retry up to 3 times with exponential backoff
- Kafka unavailable: alerts are still persisted in MySQL; re-publish on next scheduler run using a `kafka_published BOOLEAN DEFAULT FALSE` flag on the `alert` table
- Partial batch failure: each alert is inserted individually (`Promise.all`) so a single failure does not block the rest

### 4.4 Frontend Application Flow

```
Browser
  │
  ├── / (LoginPage)
  │     ├── Leaflet map (full-screen background)
  │     │   ├── Polls GET /api/alerts?minutes=60 on mount
  │     │   ├── Renders alert markers on map
  │     │   └── Scrolling alert ticker
  │     └── Auth panel (right side, 40% width)
  │           ├── Login form  → POST /auth/login
  │           └── Register button → RegisterModal
  │                               → POST /auth/register
  │
  └── /dashboard (DashboardPage)  ← protected route
        ├── User card (name, email, mobile — decoded from JWT)
        ├── Subscriptions list
        │   ├── GET /api/get-subscriptions?mobile_number=...
        │   ├── Nominatim reverse geocode for each lat/lon
        │   └── DELETE /api/delete-subscription per item
        ├── Add Subscription
        │   ├── Place search via Nominatim
        │   └── POST /api/add-subscription
        ├── Test Notification
        │   └── POST /api/dummy-test (uses first subscription's lat/lon)
        └── Live Map (DashMap)
              └── GET /api/alerts?minutes=30 on mount
```

---

## 5. Authentication and Authorization

### 5.1 Overview

Authentication is handled exclusively by `auth_server`. The `api_server` does **not** independently validate JWT signatures in the current implementation — it trusts that the client-supplied `mobile_number` field matches an existing user and verifies this by querying MySQL directly. This is a conscious simplicity trade-off suited for the current scale.

### 5.2 Registration Flow

```
  Client                    auth_server                  MySQL
    │                           │                          │
    │  POST /auth/register       │                          │
    │  {name, email,            │                          │
    │   mobile_number, password}│                          │
    │──────────────────────────►│                          │
    │                           │  SELECT by mobile_number │
    │                           │─────────────────────────►│
    │                           │◄─────────────────────────│
    │                           │  (if found → 409)        │
    │                           │                          │
    │                           │  bcrypt.hash(pw, 10)     │
    │                           │                          │
    │                           │  INSERT INTO user        │
    │                           │─────────────────────────►│
    │                           │◄─────────────────────────│
    │                           │  insertId                │
    │◄──────────────────────────│                          │
    │  201 { message }          │                          │
```

### 5.3 Login and Token Issuance

```
  Client                    auth_server                  MySQL
    │                           │                          │
    │  POST /auth/login          │                          │
    │  {mobile_number, password}│                          │
    │──────────────────────────►│                          │
    │                           │  SELECT by mobile_number │
    │                           │─────────────────────────►│
    │                           │◄─────────────────────────│
    │                           │  user row (with pw hash) │
    │                           │                          │
    │                           │  bcrypt.compare(pw, hash)│
    │                           │  (if mismatch → 401)     │
    │                           │                          │
    │                           │  jwt.sign({              │
    │                           │    userId,               │
    │                           │    mobileNumber,         │
    │                           │    name,                 │
    │                           │    email                 │
    │                           │  }, JWT_SECRET, {        │
    │                           │    expiresIn: "7d"       │
    │                           │  })                      │
    │◄──────────────────────────│                          │
    │  200 { token }            │                          │
    │                           │                          │
    │  Store token in           │                          │
    │  localStorage / sessionStorage                       │
```

### 5.4 JWT Specification

| Property | Value |
|---|---|
| Algorithm | HS256 (HMAC-SHA256) |
| Secret | `process.env.JWT_SECRET` (minimum 32 characters) |
| Expiration | `process.env.JWT_EXPIRES_IN` (default: `"7d"`) |
| Payload | `{ userId, mobileNumber, name, email, iat, exp }` |
| Storage | `localStorage` (remember-me) or `sessionStorage` (default) |
| Wire format | `Authorization: Bearer <token>` on all API requests |

### 5.5 Token Storage and Client-Side Decoding

The frontend decodes the JWT payload with a manual base64 split (no signature verification — this is intentional since the client cannot verify an HS256 token). The decoded payload is used purely for display purposes (user name, email). All mutation operations still require a round-trip to the backend which validates the user against MySQL.

### 5.6 Authorization Model

| Resource | Mechanism |
|---|---|
| `POST /auth/register` | Open — no auth required |
| `POST /auth/login` | Open — credential-based |
| `GET /api/alerts` | Open — public alert feed |
| `POST /api/add-subscription` | Implicit: validates mobile against `user` table |
| `GET /api/get-subscriptions` | Implicit: returns only caller's subscriptions if mobile is correct |
| `DELETE /api/delete-subscription` | Implicit: requires matching mobile + coordinates |
| `GET /api/get-user` | Implicit: mobile_number lookup |
| `POST /api/dummy-test` | Open (test endpoint) |

**Note:** The API server does not enforce middleware-level JWT validation on subscription endpoints. This is the primary authorization gap: any caller who knows a valid `mobile_number` can manage that user's subscriptions. Adding JWT middleware to `api_server` is the recommended next step (see Future Scope).

### 5.7 CORS Configuration

Both servers whitelist origins at startup:

```
Dev:   http://localhost:5173  (Vite dev server)
Prod:  https://test.rohitaman.com
```

`credentials: true` is enabled to support `Authorization` header forwarding.

---

## 6. Messaging, Event-Driven Architecture and Cache

### 6.1 Kafka: Alert Notification Pipeline

#### Topic Design

```
Topic:          alert_subscriptions
Replication:    1 (single-broker; see Scalability for prod recommendation)
Partitions:     1 (auto-created; default)
Offset policy:  fromBeginning: false (consumer only processes new alerts)
```

#### Producer (kafkaProducer.js)

The producer uses a **singleton connection pattern** — it connects once on `api_server` startup and reuses the connection for all subsequent publishes from both the scheduler and the `POST /api/dummy-test` endpoint.

```
publishAlert(alert):
  topic: process.env.KAFKA_TOPIC || "alert_subscriptions"
  message: JSON.stringify({ id, latitude, longitude, alertType, description })
  delivery: fire-and-forget (no acks configured)
```

#### Consumer (kafkaConsumer.js)

The consumer runs in the same process as `api_server` (started in `server.js`). It subscribes to `alert_subscriptions` with `fromBeginning: false`, meaning it only processes alerts generated after the service starts.

```
Consumer Group: process.env.KAFKA_GROUP_ID || "alert-consumer-group"
```

### 6.2 Full Alert Pipeline — Sequence Diagram

```
  Scheduler                MySQL             Kafka              Redis            SMS
  (node-cron)              (alert)         (topic)           (GEO index)      Service
      │                       │               │                   │               │
      │  [every 30 min]        │               │                   │               │
      │  buildRandomAlert()    │               │                   │               │
      │  × BATCH_SIZE          │               │                   │               │
      │                       │               │                   │               │
      │  INSERT INTO alert     │               │                   │               │
      │──────────────────────►│               │                   │               │
      │◄──────────────────────│               │                   │               │
      │  insertId              │               │                   │               │
      │                       │               │                   │               │
      │  kafkaProducer         │               │                   │               │
      │  .publishAlert(alert)  │               │                   │               │
      │──────────────────────────────────────►│                   │               │
      │                       │               │                   │               │
      │                       │               │  Consumer polls    │               │
      │                       │               │  eachMessage()     │               │
      │                       │               │  JSON.parse(msg)   │               │
      │                       │               │                   │               │
      │                       │               │  redisRepo         │               │
      │                       │               │  .getNearbySubscriptions           │
      │                       │               │  (lat, lon, 500km) │               │
      │                       │               │──────────────────►│               │
      │                       │               │                   │               │
      │                       │               │  GEOSEARCH        │               │
      │                       │               │  subscriptions_geo │               │
      │                       │               │  FROMUNKNOWN      │               │
      │                       │               │  BYRADIUS 500km   │               │
      │                       │               │◄──────────────────│               │
      │                       │               │  [member strings] │               │
      │                       │               │                   │               │
      │                       │               │  for each member: │               │
      │                       │               │  parseCoordsFromMember()           │
      │                       │               │  haversineDistance()               │
      │                       │               │                   │               │
      │                       │               │  if dist ≤ configured_distance:    │
      │                       │               │    parseMobileFromMember()         │
      │                       │               │    mobileNumbers.add(mobile)       │
      │                       │               │                   │               │
      │                       │               │  for each mobile: │               │
      │                       │               │  smsService.sendSms(mobile, msg)  │
      │                       │               │──────────────────────────────────►│
      │                       │               │                   │               │
```

### 6.3 Redis: Geospatial Subscription Index

#### Data Model

Redis stores subscriptions in two complementary structures:

```
┌────────────────────────────────────────────────────────────┐
│  Sorted Set: subscriptions_geo                             │
│  (Redis GEO commands use a ZSET internally)                │
│                                                            │
│  Member format:  "{mobileNumber}||{latitude}||{longitude}" │
│  Score:          Geo-encoded integer (52-bit)              │
│                                                            │
│  Example member: "+91-9999999999||28.6139||77.2090"        │
│                                                            │
│  Commands used:                                            │
│    GEOADD  subscriptions_geo lon lat member   (add)        │
│    GEOSEARCH ... BYRADIUS 500 km ASC          (query)      │
│    ZREM    subscriptions_geo member           (delete)     │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Hash: sub_meta:{member}                                   │
│                                                            │
│  Example key: sub_meta:+91-9999999999||28.6139||77.2090    │
│                                                            │
│  Fields:                                                   │
│    distance     → "50"   (km, user-configured)             │
│    mobileNumber → "+91-9999999999"                         │
│    latitude     → "28.6139"                                │
│    longitude    → "77.2090"                                │
│                                                            │
│  Commands used:                                            │
│    HSET sub_meta:{m} distance ... mobileNumber ...  (add)  │
│    HGET sub_meta:{m} distance                       (read) │
│    DEL  sub_meta:{m}                                (delete)│
└────────────────────────────────────────────────────────────┘
```

#### Why the Member Encodes Coordinates

The `node-redis` v5 client has a breaking change in WITHDIST/WITHCOORD response shapes across minor versions. Rather than depend on that output format, the codebase encodes the subscription coordinates directly into the member string. The consumer can always call `parseCoordsFromMember(member)` and compute the exact Haversine distance in JavaScript — avoiding any client library API fragility.

#### Haversine Distance Computation

```javascript
// Great-circle distance between two lat/lon points
haversineDistance(lat1, lon1, lat2, lon2):
  R = 6371 km
  dLat = toRad(lat2 - lat1)
  dLon = toRad(lon2 - lon1)
  a = sin²(dLat/2) + cos(lat1) · cos(lat2) · sin²(dLon/2)
  d = R · 2 · atan2(√a, √(1-a))
```

This is executed for every candidate subscription returned by GEOSEARCH. Since the initial GEOSEARCH uses a 500 km coarse radius, the Haversine check is a **two-pass filter**: Redis eliminates far-away candidates cheaply, and JavaScript applies the user's precise configured distance (e.g., 50 km).

#### Redis Persistence Configuration

```
appendonly yes           # AOF: replay all writes on restart
appendfsync everysec     # Flush AOF log once per second (balanced durability)
save 60 1000             # RDB snapshot: if 1000 keys modified in 60 seconds
```

The combination of AOF and RDB ensures the geo index survives both planned restarts and unexpected crashes.

### 6.4 Dual-Store Consistency

Subscription data lives in both MySQL (source of truth) and Redis (operational cache). The following pattern keeps them in sync:

```
Add subscription:
  1. INSERT MySQL  (if fails → abort, return error)
  2. GEOADD Redis  (if fails → subscription exists in MySQL but not Redis)
  3. HSET Redis    (if fails → distance preference missing; default used)

Delete subscription:
  1. DELETE MySQL  (if fails → abort)
  2. ZREM Redis    (soft failure tolerated; stale entry expires on next restart)
  3. DEL Redis meta
```

**Known gap:** If the process crashes between step 1 and step 2 on add, Redis will be missing a subscription that exists in MySQL. A startup reconciliation job (read all MySQL subscriptions → re-seed Redis) would close this gap.

---

## 7. Scalability Analysis

### 7.1 Current Deployment Topology

```
  Single EC2 / VM
  ┌─────────────────────────────────────────────────┐
  │  Host Nginx (HTTPS termination)                 │
  │  ├── auth_server    (1 container, 1 process)    │
  │  ├── api_server     (1 container, 1 process)    │
  │  │   ├── Kafka Producer                         │
  │  │   ├── Kafka Consumer                         │
  │  │   └── node-cron Scheduler                    │
  │  ├── frontend       (1 Nginx container)         │
  │  ├── Kafka          (1 broker, KRaft mode)      │
  │  └── Redis          (1 instance, AOF+RDB)       │
  └─────────────────────────────────────────────────┘
        External MySQL on AWS RDS
```

This is a **vertically-scaled** architecture suitable for moderate load. Below is an analysis of each layer's capacity and bottlenecks.

### 7.2 Per-Layer Throughput Analysis

#### Alert Ingestion (Scheduler)

| Parameter | Current |
|---|---|
| Frequency | Every 30 min |
| Batch size | 200 alerts per run |
| Inserts per minute | ~6.7 avg |
| Kafka msgs per run | 200 |
| Peak inserts/sec | ~200 (burst at batch insert via `Promise.all`) |

All inserts in a batch run concurrently (`Promise.all`) against the MySQL connection pool. The pool's `connectionLimit` defaults to 10. At 200 concurrent inserts, queuing occurs. This is acceptable at current scale; for larger batches, chunked inserts (50 at a time) would be preferable.

#### Kafka Consumer (Alert Fan-Out)

Each alert message triggers:
1. One Redis GEOSEARCH
2. N Haversine computations (N = subscriptions within 500 km)
3. N Redis HGET calls for distance preference
4. M SMS sends (M = qualifying subscribers)

The Kafka consumer processes one message at a time (single `eachMessage` handler). At 200 alerts per batch, this is ~200 sequential operations. With 1,000 subscribers, each alert could trigger up to 1,000 Redis operations. Redis handles ~100k ops/sec, so this is not a bottleneck.

**Bottleneck at scale:** The SMS service. At M = 1,000 SMS sends per alert and 200 alerts per batch, that is 200,000 SMS API calls per 30-minute cycle. An SMS provider rate limit will become the limiting factor before Redis or Kafka.

#### API Server (HTTP)

Node.js single-threaded event loop. Express.js with async/await. All DB and Redis calls are non-blocking. Capacity is limited by:
- MySQL connection pool (10 connections by default)
- Redis single-connection client (pipelining helps)
- Node.js CPU-bound work (minimal; Haversine is lightweight)

Estimated capacity on a standard VM: **500–2000 concurrent HTTP requests** with comfortable headroom for the current load.

### 7.3 Scaling Strategy (When Needed)

```
Phase 1: Current (Single VM)
  └── Vertical scale: larger instance type

Phase 2: Horizontal Scale
  ├── api_server: multiple instances behind a load balancer
  │   ├── Kafka consumer: each instance in the SAME consumer group
  │   │   → Kafka partitions distribute load automatically
  │   └── Scheduler: run on only ONE instance (use a distributed lock)
  │       → Redis SETNX to elect a single scheduler leader
  ├── auth_server: stateless JWT; scale horizontally freely
  ├── Redis: Redis Cluster or Redis Sentinel (read replicas)
  └── MySQL: read replicas for GET endpoints; primary for writes

Phase 3: Cloud-Native
  ├── Kubernetes (EKS / GKE) replacing Docker Compose
  ├── HPA (Horizontal Pod Autoscaler) for api_server
  ├── Managed Kafka (AWS MSK or Confluent Cloud)
  └── Managed Redis (ElastiCache Cluster Mode)
```

### 7.4 Geospatial Query Complexity

- `GEOSEARCH` on a sorted set: **O(N + log M)** where N = members in radius, M = total members
- With 100,000 subscriptions spread across India, a 500 km radius from any point typically returns a few thousand candidates — well within Redis's capacity
- Haversine is O(1) per candidate; 1,000 candidates = ~0.1 ms of CPU

### 7.5 Single Points of Failure

| Component | SPOF? | Mitigation |
|---|---|---|
| MySQL (RDS) | Yes | Enable Multi-AZ on RDS; automated failover |
| Redis | Yes | Redis Sentinel or Cluster |
| Kafka | Yes | Multi-broker cluster |
| api_server | Yes | Run 2+ instances behind LB |
| auth_server | No (stateless) | Easy to run 2+ instances |
| Host Nginx | Yes | Nginx VRRP or ALB in front |

---

## 8. DevOps and Deployment

### 8.1 Build Pipeline

The project uses **multi-stage Docker builds** to produce lean production images.

#### auth_server Dockerfile

```
Stage 1: node:20-alpine
  WORKDIR /app
  COPY package*.json → npm ci --omit=dev
  COPY auth_server/ source files
  COPY Production/auth_server/server.prod.js → overwrite server.js
  EXPOSE 5050
  CMD ["node", "server.js"]
```

#### api_server Dockerfile

```
Stage 1: node:20-alpine
  WORKDIR /app
  COPY package*.json → npm ci --omit=dev
  COPY api_server/ source files
  COPY Production/api_server/server.prod.js → overwrite server.js
  EXPOSE 5051
  CMD ["node", "server.js"]
```

#### frontend Dockerfile (two-stage)

```
Stage 1: node:20-alpine (build)
  COPY package*.json → npm ci
  COPY frontend/ source files
  COPY Production/frontend/config.prod.js → overwrite src/config.js
  COPY Production/frontend/App.prod.jsx   → overwrite src/App.jsx
  RUN npm run build -- --base=/alert-system/
  Output: /app/dist/

Stage 2: nginx:stable-alpine (serve)
  COPY --from=stage1 /app/dist/ → /usr/share/nginx/html/alert-system/
  COPY Production/frontend/nginx.conf → /etc/nginx/conf.d/default.conf
  EXPOSE 80
```

The `--base=/alert-system/` Vite flag makes all asset URLs relative to the subpath, which is required when serving under a non-root path.

#### redis Dockerfile

```
FROM redis:7-alpine
COPY redis.conf /usr/local/etc/redis/redis.conf
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]
```

### 8.2 Docker Compose Service Graph

```
                     ┌─────────────┐
                     │    redis    │
                     │  healthcheck│
                     │  redis-cli  │
                     │  ping       │
                     └──────┬──────┘
                            │ healthy
                     ┌──────▼──────┐     ┌───────────┐
                     │  api_server │     │   kafka   │
                     │  depends_on │◄────│  started  │
                     │  redis+kafka│     └───────────┘
                     └─────────────┘

  ┌───────────────┐  ┌─────────────┐  ┌────────────┐
  │  auth_server  │  │  api_server │  │  frontend  │
  │  127.0.0.1:   │  │  127.0.0.1: │  │  127.0.0.1:│
  │  5050:5050    │  │  5051:5051  │  │  8080:80   │
  └───────────────┘  └─────────────┘  └────────────┘
```

All services use `restart: unless-stopped` for automatic recovery.

### 8.3 Host Nginx Routing

```
HTTPS request to test.rohitaman.com
  │
  ├── /alert-system  → proxy_pass http://127.0.0.1:8080  (frontend container)
  ├── /api/*         → proxy_pass http://127.0.0.1:5051  (api_server container)
  ├── /auth/*        → proxy_pass http://127.0.0.1:5050  (auth_server container)
  └── /              → 301 redirect to /alert-system/
```

Standard proxy headers forwarded: `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.

TLS is managed by **Certbot** which auto-modifies the Nginx config after `certbot --nginx -d test.rohitaman.com`.

### 8.4 Environment Configuration

#### auth_server (.env)

```bash
NODE_ENV=production
PORT=5050
DB_HOST=<rds-endpoint>
DB_PORT=3306
DB_USER=<username>
DB_PASSWORD=<password>
DB_NAME=alert_system
JWT_SECRET=<32+ random characters>
JWT_EXPIRES_IN=7d
```

#### api_server (.env)

```bash
NODE_ENV=production
PORT=5051
DB_HOST=<rds-endpoint>
DB_PORT=3306
DB_USER=<username>
DB_PASSWORD=<password>
DB_NAME=alert_system
SCHEDULER_INTERVAL_MINUTES=30
SCHEDULER_BATCH_SIZE=200
REDIS_HOST=redis            # Overridden by docker-compose to service name
REDIS_PORT=6379
KAFKA_BROKER=kafka:9092     # Overridden by docker-compose to service name
KAFKA_TOPIC=alert_subscriptions
KAFKA_GROUP_ID=alert-consumer-group
KAFKA_CLIENT_ID=api-server
SMS_API_KEY=<provider-api-key>
```

Docker Compose explicitly overrides `REDIS_HOST` and `KAFKA_BROKER` with Docker service names, so the `.env` values for those two variables are only used in local development.

### 8.5 Deployment Runbook

```bash
# 1. Clone repository on server
git clone <repo-url> Incident_Alert_System
cd Incident_Alert_System

# 2. Configure environment
cp auth_server/.env.dummy auth_server/.env
cp api_server/.env.dummy  api_server/.env
# Edit both files with real credentials

# 3. Initialize database
mysql -h <rds-endpoint> -u <user> -p < sqls/Registration_Login.sql

# 4. Deploy containers
cd Production/
docker-compose up -d --build

# 5. Configure host Nginx
sudo cp nginx/nginx.conf /etc/nginx/sites-available/alertmap
sudo ln -s /etc/nginx/sites-available/alertmap /etc/nginx/sites-enabled/alertmap
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 6. Enable HTTPS
sudo certbot --nginx -d test.rohitaman.com

# 7. Verify
docker-compose ps
docker-compose logs -f api_server
```

---

## 9. Executive Summary

AlertMap is a purpose-built real-time geospatial incident notification system deployed as a three-microservice architecture on a single production VM. It correctly identifies the two core technical problems in this domain — **efficient geospatial matching** and **decoupled alert fan-out** — and solves them with appropriate tools: Redis `GEOSEARCH` for O(log n) subscription lookup and Kafka for asynchronous, durable alert delivery.

The data model is clean and minimal. The service boundaries are well-drawn: `auth_server` owns identity, `api_server` owns operational data and event processing, and the frontend is a stateless SPA. The production deployment is reproducible end-to-end via Docker Compose, multi-stage Dockerfiles, and a host Nginx configuration that handles TLS and path routing.

The system is production-deployed at `test.rohitaman.com` and demonstrably functional. The primary gap between the current state and a hardened production system is the stub SMS service, the absence of JWT middleware enforcement on the API server, and the lack of structured observability (logging, metrics, alerting on the alerting system itself).

---

## 10. Strengths 


**Geospatial design is correct and efficient.**
Using Redis as the geospatial index is the right call. A MySQL `SELECT` with Haversine in every Kafka consumer message would be catastrophic at scale. The two-pass filter (Redis 500 km coarse → Haversine precise) is a well-known pattern in location-based systems.

**Event-driven fan-out decouples ingestion from delivery.**
By publishing to Kafka and consuming asynchronously, the scheduler is not blocked by how long it takes to match subscriptions and send SMS. If the SMS provider is slow, the Kafka consumer backs up — it does not stall the alert ingestion pipeline.

**Dual persistence (AOF + RDB) on Redis.**
AOF with `everysec` flush means at most one second of geo-index data is lost on a crash. RDB snapshots provide a faster restore baseline. This is a mature Redis persistence strategy.

**Clean microservice separation with environment-driven configuration.**
Production overrides (server.prod.js, config.prod.js, App.prod.jsx) are isolated in the `Production/` directory and injected at Docker build time. Development files are untouched. This is a pragmatic approach to multi-environment configuration without a full config management system.

**Mobile number as the primary user identifier.**
This is intentional: the notification delivery mechanism is SMS, so the mobile number is the natural key. Using it as the FK in `subscription` avoids a join in the hot notification path.

**Kafka in KRaft mode.**
Eliminating Zookeeper reduces operational complexity on a single-VM deployment without sacrificing Kafka's durability or offset management.


---

## 11. Future Scope

### 11.1 Third-Party Alert API Integration

Replace the synthetic scheduler with a production ingestion pipeline:

```
┌────────────────────────────────────────────────────────┐
│  Recommended: HERE Traffic Incidents API               │
│  Endpoint: /v7/incidents                               │
│  Auth: apiKey query param                              │
│  Coverage: India-wide with TRAFFIC/ACCIDENT/CLOSURE    │
│                                                        │
│  Recommended: NDMA / IMD Data Feed                     │
│  For CLIMATE-type alerts (floods, cyclones, heatwaves) │
└────────────────────────────────────────────────────────┘
```

Implementation changes needed:
- Add `provider_incident_id VARCHAR(128) UNIQUE` to `alert` table for idempotency
- Add HTTP client (axios / node-fetch) with retry and timeout
- Normalize provider-specific alert types to internal ENUM
- Add `kafka_published BOOLEAN DEFAULT FALSE` flag for replay on Kafka downtime

### 11.2 JWT Enforcement on api_server

Add an Express middleware to `api_server` that validates the `Authorization: Bearer` token before any subscription mutation:

```javascript
// middleware/authenticate.js
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
};
```

Apply to all `POST`, `DELETE` subscription routes. Remove implicit mobile_number trust.

### 11.3 Real SMS Integration

Integrate Twilio or MSG91:

```javascript
// services/smsService.js
const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
const sendSms = async (to, body) => {
  await client.messages.create({ from: process.env.TWILIO_NUMBER, to, body });
};
```

Add delivery status webhook handling and a `notification_log` table to track sent messages, delivery receipts, and failures.

### 11.4 Multi-Channel Notifications

Extend beyond SMS:
- **Push notifications** via Firebase Cloud Messaging (FCM)
- **Email alerts** via SendGrid / AWS SES
- **In-app notifications** via WebSockets (Socket.IO) on the dashboard
- User preferences: choose which channels to enable per subscription

### 11.5 Alert Deduplication and Aggregation

At scale, a single geographic incident can generate dozens of similar alerts within the same time window from the third-party provider. Add a deduplication layer:

```
New alert arrives
  ├── Check if same alert_type within 1 km radius exists in last 15 min
  ├── If yes: skip insert (already notified)
  └── If no: insert and publish
```

### 11.6 Structured Observability Stack

```
api_server / auth_server
  └── Winston logger → JSON structured logs
      └── Filebeat / Fluentd → Elasticsearch
          └── Kibana dashboard

Prometheus metrics endpoint (/metrics)
  └── Grafana dashboard
      ├── Kafka consumer lag
      ├── Redis memory usage
      ├── Alert ingestion rate
      └── SMS delivery success rate
```

### 11.7 Kubernetes Migration

For horizontal scalability:

```yaml
# api-server Deployment (example)
replicas: 3
# All 3 pods share the same Kafka consumer group → partitions distributed
# Scheduler: use a Kubernetes CronJob (not in-process node-cron)
# Redis: switch to ElastiCache Cluster Mode
# Kafka: switch to AWS MSK (3-broker cluster)
```

### 11.8 Additional Features

| Feature | Description |
|---|---|
| Password reset | OTP via SMS; temporary token flow |
| Alert severity levels | LOW / MEDIUM / HIGH / CRITICAL with user-configurable thresholds |
| Historical alert heatmap | Visualize past incidents on map; identify high-frequency zones |
| Subscription groups | Subscribe multiple contacts to a single location (family alert) |
| Alert snooze | Silence a subscription for N hours |
| Mobile app | React Native with device push notifications (replaces SMS) |
| Admin dashboard | Internal tool: monitor pipeline health, view alert volume, manage users |
| Multi-region deployment | Deploy to multiple AWS regions; route users to nearest PoP |

---

*This document was generated from a complete analysis of the source code, configuration files, and infrastructure definitions in the repository. All API contracts, database schemas, data structures, and runtime flows described above reflect the actual implementation.*
