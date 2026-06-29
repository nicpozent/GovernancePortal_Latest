#!/bin/sh
# Generates the runtime config the SPA reads, from container env vars.
# Runs automatically (nginx official image executes /docker-entrypoint.d/*.sh before start).
set -e
cat > /usr/share/nginx/html/config.js <<EOF
window.APP_CONFIG = {
  TENANT_ID: "${AZURE_TENANT_ID}",
  SPA_CLIENT_ID: "${SPA_CLIENT_ID}",
  API_CLIENT_ID: "${API_CLIENT_ID}",
  API_BASE: "${API_BASE}"
};
EOF
echo "[web] wrote /config.js (tenant=${AZURE_TENANT_ID}, spa=${SPA_CLIENT_ID}, api=${API_CLIENT_ID}, base='${API_BASE}')"
