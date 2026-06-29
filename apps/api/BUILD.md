# BUILD — step by step

How to build and run the Birgma Governance Portal from zero. Architecture and Entra/Graph detail live in `IMPLEMENTATION_GUIDE.md`; this file is the ordered checklist.

---

## Step 1 — Prerequisites
Install:
- **Node.js 18+** and npm
- **PostgreSQL 14+** (local, or Azure Database for PostgreSQL)
- **psql** CLI (ships with Postgres)
- Access to your **Entra ID tenant** with rights to create App registrations + grant admin consent (for SSO/sync/SharePoint — can be done later; the API runs locally without it).

---

## Step 2 — Get the code
```bash
unzip birgma-governance.zip      # or clone your repo
cd birgma-governance
npm install
```

---

## Step 3 — Create the database and tables  ← (this is the table-creation code)
The DDL lives in the **`db/`** folder. Create a database, then run the three scripts **in order**:

```bash
# create the database + an app role
createdb governance
psql "$DATABASE_URL" -c "create role governance_app login password 'CHANGE_ME';"

# 1) base tables: employees, policies, policy_roles, signatures, sync_runs
psql "$DATABASE_URL" -f db/schema.sql

# 2) groups: groups, employee_groups, policy_groups  (many-to-many)
psql "$DATABASE_URL" -f db/migration_002_groups.sql

# 3) platform groups (Administrators / Compliance / Read All) + AD→platform mapping
psql "$DATABASE_URL" -f db/migration_003_group_mapping.sql

# lock the signature ledger so it can only be appended to
psql "$DATABASE_URL" -c "revoke update, delete on signatures from governance_app;"
```
`$DATABASE_URL` is e.g. `postgres://governance_app:CHANGE_ME@localhost:5432/governance`.
After this you have an **empty** database with only the three created platform groups — **no prefilled people, policies, or mappings**.

---

## Step 4 — Register the apps in Entra ID (for SSO + sync + SharePoint)
Follow `IMPLEMENTATION_GUIDE.md` **§1** (two app registrations: SPA + API, App Role `Governance.Admin`, exposed scope `access_as_user`) and **§2** (choose a least-privilege sync tier). Collect:
- `AZURE_TENANT_ID`, `API_CLIENT_ID`, `API_AUDIENCE`
- `GRAPH_ENTERPRISE_APP_SP_ID` (enterprise app object id)
- `SHAREPOINT_SITE_ID` (grant `Sites.Selected` on the Governance site — §3)

> You can skip this step to run the API locally first; auth-protected routes will simply reject calls until the ids are set.

---

## Step 5 — Configure environment
```bash
cp .env.example .env
# edit .env: DATABASE_URL, AZURE_TENANT_ID, API_CLIENT_ID, API_AUDIENCE,
#            GRAPH_ENTERPRISE_APP_SP_ID, SHAREPOINT_SITE_ID, FRONTEND_ORIGIN
# LOCAL DEV ONLY: set GRAPH_CLIENT_ID + AZURE_CLIENT_SECRET to call Graph from your machine.
# PRODUCTION: leave those blank — the app uses its Managed Identity.
```

---

## Step 6 — Run the API
```bash
npm run dev            # http://localhost:8080
curl localhost:8080/healthz     # -> {"ok":true}
```

---

## Step 7 — Populate the directory (no manual data entry)
With Entra connected, sign in as an admin and call **Sync now** (or `POST /api/sync`). This:
1. reads only the users/groups **assigned to the Governance app** (least privilege),
2. upserts them into `employees`, and creates a `groups` row (`kind='Directory'`) + memberships for each assigned security group.

Then on the **Groups & access** screen: **Import from Active Directory** → pick directory groups → map them into **Administrators / Compliance / Read All** (or a group you create). Membership rolls up automatically; mapping a group into **Administrators** grants admin.

---

## Step 8 — Wire the front end
Point the SPA (the prototype) at the API:
```
VITE_TENANT_ID=…  VITE_SPA_CLIENT_ID=…  VITE_API_CLIENT_ID=…  VITE_API_BASE=https://api.governance.birgma.com
```
Replace the prototype's in-memory data with `frontend/api.js` calls (table in `IMPLEMENTATION_GUIDE.md` §6 + the groups methods). Gate the app behind `signIn()`.

---

## Step 9 — Deploy private
Follow `IMPLEMENTATION_GUIDE.md` **§7**: Azure App Service / Container Apps with **Managed Identity**, secrets in **Key Vault**, **Conditional Access** (MFA + compliant device), and either **Front Door + WAF** or **Private Endpoints + VNet** so nothing is publicly reachable. Postgres behind a private endpoint; signatures shipped to Log Analytics / Sentinel for audit.

---

### Quick reference — table-creation files
| File | Creates |
|---|---|
| `db/schema.sql` | employees · policies · policy_roles · signatures · sync_runs |
| `db/migration_002_groups.sql` | groups · employee_groups · policy_groups |
| `db/migration_003_group_mapping.sql` | platform groups (Administrators/Compliance/Read All) · group_mappings · views |
