# ─────────────────────────────────────────────────────────────────────────────
# AlertMap – Auth Server Dockerfile
# Build context: Incident_Alert_System/  (docker-compose sets context: ..)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (better layer caching)
COPY auth_server/package.json \
     auth_server/package-lock.json ./

RUN npm ci --omit=dev

# Copy application source
COPY auth_server/ .

# Overwrite server.js with production version (adds production CORS origin)
COPY Production/auth_server/server.prod.js server.js

EXPOSE 5050

CMD ["node", "server.js"]
