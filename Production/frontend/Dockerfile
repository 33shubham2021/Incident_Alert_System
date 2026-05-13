# ─────────────────────────────────────────────────────────────────────────────
# AlertMap – Frontend Dockerfile
# Build context: Incident_Alert_System/  (docker-compose sets context: ..)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build React app ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY frontend/package.json \
     frontend/package-lock.json ./

RUN npm ci

# Copy all source files
COPY frontend/ .

# Overwrite dev config/router with production versions
COPY Production/frontend/config.prod.js src/config.js
COPY Production/frontend/App.prod.jsx   src/App.jsx

# Build with /alert-system/ as the base path
RUN npm run build -- --base=/alert-system/

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────
FROM nginx:stable-alpine

# Place build output under /alert-system/ so nginx path matching works
COPY --from=builder /app/dist /usr/share/nginx/html/alert-system

# Container nginx config
COPY Production/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
