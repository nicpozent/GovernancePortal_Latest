# ── Birgma Governance Portal — web (Vite build, served by nginx) ────
# Stage 1: build the SPA bundle (precompiled JSX, self-hosted React/MSAL).
# Node 22 (current LTS) — required by Vite 8's engines. Build-stage only;
# the production image below is nginx, so this has no runtime footprint.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Reproducible install from the committed lockfile (includes devDeps for the build).
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

# Stage 2: serve the built bundle with nginx.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
# Regenerate config.js from env at container start (overwrites the build's placeholder).
COPY 40-envconfig.sh /docker-entrypoint.d/40-envconfig.sh
RUN chmod +x /docker-entrypoint.d/40-envconfig.sh
EXPOSE 80 443
