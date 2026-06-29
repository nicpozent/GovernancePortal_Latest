# SBB — Node 22 + Docker Compose (Azure Container Apps target)

_Solution Building Block realizing ABB **T3 Application Runtime / Container Platform** in the Birgma Governance Portal._

## Realization
Multi-stage builds; non-root; healthchecks; restart: unless-stopped; loopback-only DB port.

## Where it lives (code)
`deploy/docker-compose.yml, apps/*/Dockerfile`

## Maturity
Production-grade (single host)
