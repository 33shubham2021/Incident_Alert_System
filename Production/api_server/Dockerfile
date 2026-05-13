# ─────────────────────────────────────────────────────────────────────────────
# AlertMap – API Server Dockerfile
# Build context: Incident_Alert_System/  (docker-compose sets context: ..)
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (better layer caching)
COPY api_server/package.json \
     api_server/package-lock.json ./

RUN npm ci --omit=dev

# Copy application source
COPY api_server/ .

# Overwrite server.js with production version (adds production CORS origin)
COPY Production/api_server/server.prod.js server.js

EXPOSE 5051

CMD ["node", "server.js"]
