# Birgma Governance Portal — Full Installation Guide

End-to-end: from a bare Windows VM to a running, Entra-secured portal.

---

## Part 1 — Prepare the Windows VM (on VMware ESXi)

1. **Enable nested virtualization** (required for WSL2/Docker). Power off the VM,
   then in vSphere → VM → Edit Settings → CPU → tick
   **"Expose hardware-assisted virtualization to the guest OS"**. Power on.
2. Windows Server/10/11 with the latest updates.

## Part 2 — Install WSL2

1. Open **PowerShell as Administrator**:
   ```powershell
   wsl --install
   ```
   Reboot if prompted. This installs WSL2 + a default Linux distro.
2. Verify:
   ```powershell
   wsl --status
   wsl -l -v        # distro should show VERSION 2
   ```
   If it says version 1: `wsl --set-default-version 2`. If WSL needs an update: `wsl --update`.

## Part 3 — Install Docker Desktop

1. Download Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/
2. Install with **"Use WSL 2 instead of Hyper-V"** checked.
3. Launch Docker Desktop. Wait for **"Engine running"**.
4. Settings → **General** → ensure **"Use the WSL 2 based engine"** is on.
5. Stay in **Linux containers** mode (tray menu shows "Switch to Windows containers…").
6. Verify in PowerShell:
   ```powershell
   docker version
   docker compose version
   docker run --rm hello-world
   ```

## Part 4 — Deploy the application

1. Copy the `governance-deploy` folder to the VM, e.g. `C:\governance-deploy`.
2. Configure secrets:
   ```powershell
   cd C:\governance-deploy
   copy .env.example .env
   notepad .env                 # set POSTGRES_PASSWORD, APP_DB_PASSWORD + the 3 Entra IDs
   copy birgma-governance\.env.example birgma-governance\.env
   notepad birgma-governance\.env   # GRAPH_CLIENT_ID + AZURE_CLIENT_SECRET + SHAREPOINT_SITE_ID
   mkdir backups
   mkdir certs
   ```
3. TLS cert + key into `certs\` (`fullchain.pem`, `privkey.pem`) — internal CA or
   public cert. For a quick test, a self-signed pair (see Part 7).
4. Build & start (fresh DB runs every migration + grants automatically):
   ```powershell
   docker compose up --build -d
   docker compose ps                       # db, api, web healthy
   curl.exe -k https://localhost/healthz   # {"ok":true}
   ```
5. Allow inbound **443** (and **80** for redirect) in Windows Defender Firewall.

---

## Part 5 — Azure / Microsoft Entra setup

You need **two app registrations** in the Entra admin center.

### 5a. API app ("Governance API")
1. App registrations → New registration → name "Governance API".
2. **Expose an API** → Set Application ID URI `api://<api-client-id>` →
   Add a scope `access_as_user` (admins + users consent).
3. **App roles** → create `Governance.Admin` (allowed member type: Users/Groups);
   assign it to your admins (Enterprise applications → Users and groups).
4. **Manifest** → set `"requestedAccessTokenVersion": 2` (v2 tokens — required, or
   sign-in fails with `invalid_token` / wrong issuer).
5. **Certificates & secrets** → New client secret → copy the **Value** →
   `AZURE_CLIENT_SECRET` in `birgma-governance/.env`; set `GRAPH_CLIENT_ID` =
   this app's client id, and `API_CLIENT_ID` / `API_AUDIENCE` accordingly.

### 5b. SPA app ("Governance Portal")
1. New registration → name "Governance Portal" → platform **Single-page application**.
2. **Redirect URI** = your exact site origin, e.g. `https://governance.biltemabirgma.com`
   (and/or `http://localhost` for local testing). Must be https for real hosts.
3. **API permissions** → add the `access_as_user` scope you exposed in 5a → grant consent.
4. Put this app's client id in `SPA_CLIENT_ID` (root `.env`) and the tenant id in `AZURE_TENANT_ID`.

### 5c. Microsoft Graph (directory sync) — on the API app
API permissions → Microsoft Graph → **Application permissions**, then
**Grant admin consent**:
- `User.Read.All`, `GroupMember.Read.All`, `Application.Read.All` (Tier-3 sync), and
  `Mail.Send` only if you later enable email reminders.

### 5d. SharePoint access — Sites.Selected (two steps)
1. API app → API permissions → Microsoft Graph → Application → add **`Sites.Selected`**
   → **Grant admin consent**. (This alone grants access to NO sites.)
2. Grant read on the one site, via Graph Explorer (signed in as a SharePoint/Global admin):
   - **POST** `https://graph.microsoft.com/v1.0/sites/<site-id>/permissions`
   - Body:
     ```json
     { "roles": ["read"], "grantedToIdentities": [ { "application": { "id": "<api-client-id>", "displayName": "Governance API" } } ] }
     ```
   - Expect `201 Created`. The site id is `host,siteGuid,webGuid` (from
     `GET /sites/{hostname}:/sites/{path}`).

### 5e. Assign people to the app (required for sign-in + least-privilege sync)
Enterprise applications → **Governance API** → Properties → set **"Assignment
required?" = Yes**, then **Users and groups** → assign the employees/groups who
should use the portal. Directory sync reads **only** app-assigned principals
(least privilege), so anyone who should appear as an employee must be assigned here.

After Azure is configured, restart the API: `docker compose up -d`.

---

## Part 6 — First use
1. Browse to the site → **Sign in with Microsoft**.
2. **Employees → Sync now** to import users + groups from the directory.
3. Map directory groups into platform groups (or add members directly),
   assign policies to groups, set deadlines, build quizzes.

## Part 7 — Self-signed cert (testing only)
```powershell
docker run --rm -v ${PWD}/certs:/certs alpine/openssl req -x509 -newkey rsa:2048 -nodes -days 825 `
  -keyout /certs/privkey.pem -out /certs/fullchain.pem `
  -subj "/CN=governance.biltemabirgma.com" -addext "subjectAltName=DNS:governance.biltemabirgma.com"
```
Browsers warn (untrusted) — fine for testing, not production.

---

## Part 8 — Security considerations

**This VM/container model (current):**
- All traffic browser↔nginx is **TLS-encrypted** (once on https). Internal hops
  (nginx↔api, api↔db) stay on the Docker network and never leave the host.
- DB uses a **least-privilege** app role; signature/audit/quiz-attempt ledgers are
  **append-only** (no UPDATE/DELETE for the app).
- Token validation enforces signature, issuer, audience, **tenant**, and the
  `access_as_user` scope. Admin actions require the `Governance.Admin` role.
- 15-minute idle auto-logout; security headers + Content-Security-Policy on the web tier.

**Harden for production:**
- **Drop the `5432:5432` port mapping** so Postgres is only reachable inside the
  Docker network (the api already uses `db:5432` internally). Direct DB access then
  goes via `docker compose exec` or an SSH tunnel.
- **Protect `.env` and `certs/`** — they hold the DB superuser password and TLS
  private key. Restrict file permissions; enable **BitLocker** on the VM disk.
- **Limit who can log into the VM / use Docker** (Docker access ≈ root over the app).
- **Off-host, access-controlled backups** (the full-backup zip contains secrets).

**The "Azure-native" alternative (most secure, no secrets on disk):**
The codebase is built to also run on **Azure App Service / Container Apps** with:
- **Managed Identity** instead of a client secret — `DefaultAzureCredential` picks it
  up automatically when `GRAPH_CLIENT_ID`/`AZURE_CLIENT_SECRET` are left blank, so
  **no secret is stored anywhere**.
- **Azure Key Vault** for any remaining secrets (DB connection string), referenced by
  the app's identity — nothing in `.env`.
- **Azure Database for PostgreSQL** behind a **Private Endpoint** (no public exposure),
  TLS enforced (`PGSSL=require`).
- **Conditional Access** (require MFA / compliant device) on the apps — policy-side,
  no code change.
This removes the two weakest points of the VM model (secrets in `.env`, host-level
DB access). See `birgma-governance/IMPLEMENTATION_GUIDE.md` §7 for the target topology.

---

## Troubleshooting
- **502 on every call** → API crashed; `docker compose logs --tail=40 api`.
- **`invalid_token` / wrong issuer** → set `requestedAccessTokenVersion: 2` (5a.4), re-login.
- **`permission denied for view`** → grants didn't apply; re-run `docker-grants.sql`.
- **Sync `manager` error** → ensure you're on the current build (members cast to user).
- **Quiz/SharePoint 502** → check Graph permissions + `Sites.Selected` grant in logs.
