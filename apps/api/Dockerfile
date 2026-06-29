# ── Birgma Governance API ───────────────────────────────────
# Linux container (runs on your Docker-in-VMware host via WSL2/Docker)
# Node 22 (current LTS); Node 18 is end-of-life.
FROM node:22-alpine

# postgresql-client (v16, matching the db image) provides pg_dump for backups.
RUN apk add --no-cache postgresql16-client

# Run as the built-in non-root user that the node image ships with.
WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json package-lock.json ./
# Reproducible install from the committed lockfile.
RUN npm ci --omit=dev && npm cache clean --force

# App source.
COPY . .

# Directory for scheduled auto-backups + uploaded training files (mounted as volumes).
RUN mkdir -p /backups /uploads && chown node:node /backups /uploads

ENV NODE_ENV=production
EXPOSE 8080

# Liveness probe matches the /healthz route in src/server.js
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

USER node
CMD ["node", "src/server.js"]
