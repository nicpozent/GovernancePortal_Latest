# Birgma Governance Portal

A policy-governance & compliance portal. Admins publish governance documents
(stored in SharePoint), assign them to groups, and optionally attach quizzes and
deadlines; managers upload and assign their own documents/trainings to their
teams; employees read and **acknowledge** them. The system keeps an append-only
compliance record and reports on who has and hasn't signed.

## Architecture
Three containers behind Microsoft Entra ID:
- **web** — React SPA + nginx (TLS termination, serves the SPA, proxies `/api`)
- **api** — Node.js / Express (token validation, RBAC, all domain logic)
- **db**  — PostgreSQL 16 (append-only signature, audit & quiz-attempt ledgers)

Integrates with Entra ID (SSO + app roles: `Governance.Admin`, `Governance.Manager`)
and Microsoft Graph (directory sync, SharePoint document access).
See [docs/ARCHITECTURE-AND-DECISIONS.md](docs/ARCHITECTURE-AND-DECISIONS.md) (architecture + decision records) and [docs/ARCHITECTURE-BUILDING-BLOCKS.md](docs/ARCHITECTURE-BUILDING-BLOCKS.md) (TOGAF ABBs).

## Layout
```
governance-portal/
├── apps/
│   ├── api/        backend API, DB schema + migrations, SCIM endpoint
│   └── web/        single-page frontend (app.jsx) + nginx
├── deploy/
│   ├── docker-compose.yml
│   ├── certs/      TLS cert + key (gitignored) — fullchain.pem / privkey.pem
│   ├── backups/    pg_dump output (gitignored)
│   ├── uploads/    manager-uploaded files (gitignored)
│   └── scripts/    backup-all.ps1, reset.ps1
├── docs/           architecture (+ADRs, ABBs), install guide, TLS, reset, restore, DR, migrations, observability, GDPR
├── .env.example    tracked template; real .env files stay ignored
└── .gitignore
```

## Quick start
```powershell
# 1. secrets
cd governance-portal
copy .env.example deploy\.env            # set DB passwords + Entra SPA/API IDs
copy .env.example apps\api\.env          # set GRAPH_CLIENT_ID + AZURE_CLIENT_SECRET + SHAREPOINT_SITE_ID
#    (apps\api\.env also reads the Azure/Graph keys; see apps/api/.env.example)

# 2. TLS cert + key into deploy\certs\  (fullchain.pem, privkey.pem)
mkdir deploy\certs deploy\backups deploy\uploads

# 3. build + run (fresh DB runs every migration automatically)
cd deploy
docker compose up --build -d
```
Then browse to https://localhost. Full setup: [docs/INSTALL-GUIDE.md](docs/INSTALL-GUIDE.md).

## Operations
- **Reset to clean state:** `deploy/scripts/reset.ps1` (see [docs/RESET.md](docs/RESET.md))
- **Backups & restore:** `deploy/scripts/backup-all.ps1`, [docs/RESTORE.md](docs/RESTORE.md)
- **Disaster recovery:** [docs/DISASTER-RECOVERY.md](docs/DISASTER-RECOVERY.md)
- **Database migrations:** [docs/DATABASE-MIGRATIONS.md](docs/DATABASE-MIGRATIONS.md)

## Configuration
All secrets come from `.env` files (`deploy/.env`, `apps/api/.env`) and
`deploy/certs/`; **never commit them** (see `.gitignore`). Required values are
listed in `.env.example` and `apps/api/.env.example`.

## Security
Auth is delegated to Entra ID (delegated tokens only; app-only tokens rejected).
Admin actions require the `Governance.Admin` app role; managers act only on their
own content and team. Compliance tables are append-only; uploads are extension-
allowlisted and served with a server-determined content type. Current review and
open items: [REVIEW.md](REVIEW.md) and [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md).
