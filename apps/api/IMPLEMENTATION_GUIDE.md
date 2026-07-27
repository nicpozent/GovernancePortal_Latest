# Birgma Governance Portal — Implementation Guide

Integrate the Policy Management prototype with **Entra ID (SSO)**, **Microsoft Graph** (directory sync), **SharePoint** (documents), and **PostgreSQL** (signatures system-of-record) — deployed **private**, not public.

```
Browser (SPA + MSAL.js)
   │  1. OIDC login (Auth Code + PKCE) ───────────────► Entra ID  (SSO · MFA · Conditional Access)
   │  2. calls API with Bearer access token
   ▼
Governance API (Express, this repo)            ── Managed Identity ──► Key Vault (no secrets in code)
   │  validates token (JWKS · audience · issuer · App Roles)
   ├─ Microsoft Graph  → Entra users/groups       (sync, least privilege)
   ├─ Microsoft Graph  → SharePoint files+versions (Sites.Selected)
   └─ PostgreSQL       → policies · assignments · signature ledger
```

Identity on a signature comes from the **verified token** (`oid`, `name`), never from client input — so an acknowledgement is bound to the authenticated account.

---

## 0. Prerequisites
- Azure subscription + permission to create **App registrations** and grant **admin consent**.
- An Entra tenant with your people (on-prem AD is fine if synced via **Entra Connect** — you only ever talk to Entra).
- A SharePoint site holding the governance documents.
- PostgreSQL 14+ (Azure Database for PostgreSQL Flexible Server recommended).
- Node 18+.

---

## 1. Entra ID — two app registrations + SSO

Create **two** registrations (cleaner separation; you *can* merge them).

### 1a. API app (`Governance API`)
1. **App registrations → New**. Single tenant.
2. **Expose an API →** set Application ID URI `api://<API_CLIENT_ID>` → **Add a scope** `access_as_user` (admins+users can consent).
3. **App roles → Create**: `Governance.Admin` (value `Governance.Admin`, allowed member types: Users/Groups). Everyone else is a normal employee with no role.
4. **API permissions** (Application permissions for Graph — see §2 for the least-privilege set), then **Grant admin consent**.
5. Note **Directory (tenant) ID** and **Application (client) ID** → `.env` `AZURE_TENANT_ID`, `API_CLIENT_ID`.

### 1b. SPA app (`Governance Portal`)
1. **App registrations → New**. Platform **Single-page application**, Redirect URI = your site origin (`https://governance.birgma.com`).
2. **API permissions → My APIs →** add `Governance API` → `access_as_user`. Grant consent.
3. **Enterprise applications → Governance Portal → Properties → "Assignment required?" = Yes.** Now only **assigned** users can sign in — and this same assignment list is what the least-privilege sync reads. Assign your governance **groups** (e.g. `Engineering`, `IT Security`, …) and any individuals; assign `Governance.Admin` to the compliance team.
4. Front-end env: `VITE_SPA_CLIENT_ID`, `VITE_TENANT_ID`, `VITE_API_CLIENT_ID`, `VITE_API_BASE`.

> **App-role → app-role mapping note:** the App Role lives on the **API app**, but Entra emits the `roles` claim based on the user's assignment to the **enterprise app**. Assign `Governance.Admin` members on the API app's enterprise app, and request the API scope from the SPA — the `roles` claim then rides in the API access token (`auth.js` reads it).

---

## 2. Least-privilege directory synchronization ★

The default `User.Read.All` + `GroupMember.Read.All` application permissions are tenant-wide reads — **avoid relying on them alone**. Pick the highest tier you can run:

### Tier 1 — SCIM provisioning (zero Graph directory permissions) ✅ best
- Grant the app **no** Graph user/group permissions.
- **Enterprise app → Provisioning → Automatic.** Tenant URL `https://api.governance.birgma.com/scim/v2`, secret token = a long random string (store in Key Vault → `SCIM_SECRET_TOKEN`).
- Assign your governance groups to the app. Entra **pushes only assigned principals** to `scim/scim.routes.js` on its cycle (~40 min). The app physically cannot see anyone unassigned.
- Enable: uncomment the SCIM line in `src/server.js`, add `create unique index on employees (upn);`.

### Tier 2 — Administrative Unit–scoped custom role (Graph, confined) ✅ strong
- Put in-scope users in an **Administrative Unit**.
- Create a **custom directory role** with `microsoft.directory/users/standard/read` (+ group member read) and **assign it to the app's service principal scoped to that AU**.
- Now `User.Read.All`-style reads are **physically limited to the AU**, not the tenant. Requires Entra ID P1. `src/services/sync.js` runs unchanged.

### Tier 3 — App-assignment-scoped queries (works everywhere) — the repo default
- Permissions: `Application.Read.All`, `GroupMember.Read.All`, `User.Read.All` (admin-consented).
- `sync.js` reads **only** `/servicePrincipals/{spId}/appRoleAssignedTo` + the **assigned** groups' members — never the whole directory. The permission is broad but the **data path is narrow**, and "Assignment required = Yes" gates it.

**Always-on least-privilege hygiene (every tier):**
- `$select=id,displayName,userPrincipalName,mail,jobTitle,department` — read only the 5 fields you store.
- **Managed Identity** in prod (no client secret anywhere).
- **Access reviews** on who's assigned to the app; **app instance property lock**.
- SharePoint: **`Sites.Selected`**, granted on **only** the Governance site (see `services/sharepoint.js` header for the exact `POST /sites/{id}/permissions` call). Never `Sites.Read.All`.

`GRAPH_ENTERPRISE_APP_SP_ID` = the **objectId of the enterprise app (service principal)**, found under *Enterprise applications → Governance Portal → Overview → Object ID*.

---

## 3. SharePoint
1. Find the Graph **site id**: `GET https://graph.microsoft.com/v1.0/sites/birgma.sharepoint.com:/sites/Governance` → use the returned `id` → `.env` `SHAREPOINT_SITE_ID`.
2. Grant `Sites.Selected` read on that site only (call in `services/sharepoint.js`).
3. When an admin creates a policy, they can paste a SharePoint link — `resolveSharingUrl()` turns it into the drive/item ids. `GET /api/policies/:id/document` returns a short-lived preview URL + the authoritative `_UIVersionString`, which is what flips a policy to **"re-sign required"** when a new version is published.

---

## 4. PostgreSQL
```bash
createdb governance
psql "$DATABASE_URL" -f db/schema.sql
# harden the ledger at the DB level:
psql "$DATABASE_URL" -c "revoke update, delete on signatures from governance_app;"
```
Map your Entra **group displayName** → `employees.department` → `policy_roles.role` (the prototype uses `Engineering`, `IT Security`, `Finance`, `HR`, `Sales`, `Operations`). Keep group names aligned with these strings, or add a small mapping table if they differ.

---

## 5. Run it
```bash
cd apps/api
cp .env.example .env        # fill in the ids
npm install
npm run migrate
npm run dev                 # http://localhost:8080  (GET /healthz -> {ok:true})
```
Local Graph calls need a dev secret (`GRAPH_CLIENT_ID` + `AZURE_CLIENT_SECRET`); production leaves them blank and uses Managed Identity.

---

## 6. Wire the prototype to the API
Replace the prototype's in-memory arrays with `frontend/api.js`:

| Prototype action | Call |
|---|---|
| Role switcher / persona | `api.me()` → `isAdmin` chooses the view set |
| Policy list (My / Library) | `api.policies()` → each item has `status` + `signature` |
| Open reader | `api.document(id)` → `webUrl` + `downloadUrl` + authoritative `version` |
| **Sign & acknowledge** | `api.sign(policyId, fullName)` (oid/name/timestamp captured server-side) |
| My signatures / admin feed | `api.signatures()` |
| Employees table | `api.employees()` / `api.addEmployee()` |
| Add / edit policy | `api.createPolicy()` / `api.updatePolicy()` |
| **Sync now** | `api.sync()` |
| Dashboard | `api.dashboard()` |

Gate the app behind `signIn()` on load; the `requireScrollToSign` UX stays a pure front-end rule.

---

## 7. Make it private & secure (deploy checklist)
- **Host:** Azure App Service / Container Apps (API) + Static Web Apps or App Service (SPA). Assign a **system-assigned Managed Identity**; grant it the Graph app roles and Key Vault `get` on secrets.
- **No anonymous access:** every `/api/*` route requires a valid token (enforced in `auth.js`) — the SPA check is not the security boundary.
- **Conditional Access** on both apps: require **MFA**, **compliant/Hybrid-joined device**, trusted location.
- **Private networking:** front with **Azure Front Door + WAF**, or go fully private with **Private Endpoints + VNet integration** so it's only reachable on the Birgma network/VPN. Postgres reachable only via private endpoint.
- **Secrets:** none in code; client secret/cert (if any) in **Key Vault**, read via Managed Identity. `cacheLocation: sessionStorage` in the SPA.
- **Transport:** HTTPS/HSTS only (helmet sets headers), CORS locked to the one SPA origin.
- **Audit:** ship API + Entra sign-in logs to **Log Analytics / Microsoft Sentinel**; the `signatures` table is your append-only attestation record (DB-level UPDATE/DELETE revoked).
- **Least privilege everywhere:** Tier-1/2 sync, `Sites.Selected`, `$select` minimal fields, periodic access reviews.

---

## 8. Groups & targeted assignment (migration 002)
Assign policies to **specific groups**, not everyone. Groups are first-class and **many-to-many** (a person can be in several).

- **Tables** (`db/migration_002_groups.sql`): `groups` (Entra-synced *or* portal-Local), `employee_groups` (membership), `policy_groups` (which groups a policy targets). Run it after `schema.sql`.
- **Entra-synced groups:** any security group you assign to the Governance enterprise app is picked up by `sync.js` → upserted into `groups`, with full membership in `employee_groups`. Manage these in Entra; the portal shows them read-only.
- **Local groups:** create ad-hoc groups in the portal (`POST /api/groups`) and manage membership directly (`POST/DELETE /api/groups/:id/members`) — useful for cross-cutting sets like *PCI-scope* or *People-managers* that aren't a clean Entra group.
- **Targeting:** assign a policy to one or more groups (`createPolicy({…, groupIds:[…]})`). An employee sees/must-sign a policy only if they're a member of **at least one** assigned group; the dashboard counts each required person once.
- **API:** `GET /api/groups` (with member + policy counts), `GET /api/groups/:id/members`, `POST /api/groups`, `POST /api/groups/:id/members`, `DELETE /api/groups/:id/members/:oid`.

> `policy_roles` (the original single-string model) is now legacy; `policy_groups` + `employee_groups` are authoritative. The migration backfills the new tables from it automatically.

---

## 9. Platform groups & AD mapping (migration 003)
Internal **platform groups** are authorization roles you map directory groups into. Created by `migration_003`: **Administrators** (admin), **Compliance**, **Read All** — plus any you add. No members or mappings are prefilled.

- **Import + map:** sync brings AD/Entra security groups in as `kind='Directory'` groups; then map each into a platform group (`POST /api/group-mappings`). Members roll up via the `platform_group_members` view.
- **Admin:** membership of **Administrators** (view `admin_users`) grants platform admin — an alternative/supplement to the `Governance.Admin` App Role, so you manage admins by mapping an AD group instead of hard-coding people.
- **API:** `GET /api/platform-groups`, `GET /api/directory-groups`, `POST /api/platform-groups`, `POST /api/group-mappings`, `DELETE /api/group-mappings/:adId/:pgId`.
- This is the **Groups & access** screen in the prototype.

> See `BUILD.md` for the ordered, copy-paste build checklist.

---

## File map
```
apps/api/
├── db/schema.sql                  base schema (employees, policies, signatures, sync_runs)
├── db/migration_002_groups.sql    first-class many-to-many groups (§8)
├── db/migration_003_group_mapping.sql  platform groups + AD→platform mapping (§9)
├── BUILD.md                       ordered step-by-step build checklist
├── package.json · .env.example
├── src/
│   ├── config.js                  env + derived Entra endpoints
│   ├── db.js                      pg pool
│   ├── auth.js                    Entra token validation + admin gate
│   ├── graph.js                   app-only Graph client (Managed Identity / dev secret)
│   ├── services/sync.js           least-privilege directory sync (Tier 3 default)
│   ├── services/sharepoint.js     Sites.Selected document + version reads
│   ├── routes.js                  all API endpoints (maps to the screens)
│   └── server.js                  helmet · CORS · rate-limit · mount
├── scim/scim.routes.js            Tier-1 SCIM endpoint (zero Graph permissions)
└── frontend/
    ├── authConfig.js              MSAL.js config (Auth Code + PKCE)
    └── api.js                     token-attaching API client (incl. groups)
```
