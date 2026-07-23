# SBB — mounted Docker volume (Azure Blob target)

_Solution Building Block realizing ABB **T5 Object / File Storage** in the Birgma Governance Portal._

## Realization
UUID filenames; extension allowlist; server-determined content type + nosniff on serve.

## Where it lives (code)
`apps/api/src/storage.js, apps/api/src/uploads.js, deploy/docker-compose.yml (volumes)`

## Maturity
Local volume (no replication); target: object storage
