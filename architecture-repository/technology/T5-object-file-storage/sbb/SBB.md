# SBB — mounted Docker volume (Azure Blob target)

_Solution Building Block realizing ABB **T5 Object / File Storage** in the Birgma Governance Portal._

## Realization
UUID filenames; extension allowlist; server-determined content type + nosniff on serve.

## Where it lives (code)
`deploy/docker-compose.yml (volumes), apps/api/src/routes.js (uploads)`

## Maturity
Local volume (no replication); target: object storage
