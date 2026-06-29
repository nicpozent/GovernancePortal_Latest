# Birgma Governance Portal — Installation (detailed, step by step)

From a bare Windows VM to a running, Entra-secured portal. Allow ~60–90 minutes
the first time (mostly Azure setup and waiting on builds).

---

## 0. Prerequisites & overview
You will set up, in order:
1. The Windows VM (with nested virtualization).
2. WSL2 + Docker Desktop.
3. The application (containers).
4. Microsoft Entra ID (two app registrations + Graph/SharePoint permissions).
5. First run + directory sync.

The app is three containers — **web** (nginx + SPA), **api** (Node), **db**
(PostgreSQL) — orchestrated by Docker Compose. You run everything from the
`deploy/` folder.

---

## 1. Windows VM (on VMware ESXi)
1. **Enable nested virtualization** (required for WSL2). Power off the VM →
   vSphere → Edit Settings → CPU → tick **"Expose hardware-assisted
   virtualization to the guest OS"** → power on.
2. Windows Server 2019/2022 or Windows 10/11, fully updated.
3. Give it at least 4 vCPU / 8 GB RAM / 60 GB disk for comfort.

## 2. WSL2
In **PowerShell as Administrator**:
```powershell
wsl --install
```
Reboot if prompted, then verify:
```powershell
wsl --status
wsl -l -v          # a distro should show VERSION 2
```
If needed: `wsl --set-default-version 2` and `wsl --update`.

## 3. Docker Desktop
1. Download: https://www.docker.com/products/docker-desktop/
2. Install with **"Use WSL 2 instead of Hyper-V"** checked.
3. Launch it; wait for **"Engine running"** (whale icon).
4. Settings → General → **"Use the WSL 2 based engine"** on; **"Start Docker
   Desktop when you sign in"** on (so the stack survives reboots).
5. Stay in **Linux containers** mode.
6. Verify:
```powershell
docker version
docker compose version
docker run --rm hello-world
```

## 4. Get the application onto the VM
1. Copy the `governance-portal` folder to e.g. `C:\governance-portal`.
2. Create the secret + state files and folders:
```powershell
cd C:\governance-portal
copy .env.example deploy\.env
copy .env.example apps\api\.env
mkdir deploy\certs, deploy\backups, deploy\uploads
```
3. Edit **`deploy\.env`** (used by docker-compose):
   - `POSTGRES_PASSWORD` — any strong password (DB superuser).
   - `APP_DB_PASSWORD` — any strong password (the app's least-privilege DB role).
   - `AZURE_TENANT_ID`, `SPA_CLIENT_ID`, `API_CLIENT_ID` — from §5.
4. Edit **`apps\api\.env`** (used by the API):
   - `AZURE_TENANT_ID`, `API_CLIENT_ID`, `API_AUDIENCE` (`api://<API_CLIENT_ID>`).
   - `GRAPH_CLIENT_ID`, `AZURE_CLIENT_SECRET` — from §5 (or leave blank to use
     Managed Identity on Azure).
   - `SHAREPOINT_SITE_ID` — from §5d.
   - Optional email: `GRAPH_MAIL_SENDER`, `REMINDERS_ENABLED=true`.

## 5. Microsoft Entra ID
### 5a. API app — "Governance API"
1. Entra admin centre → App registrations → New registration → "Governance API".
2. **Expose an API** → set Application ID URI `api://<api-client-id>` → Add scope
   `access_as_user` (admins & users can consent).
3. **App roles** → create `Governance.Admin` and `Governance.Manager`
   (allowed member types: Users/Groups).
4. **Manifest** → set `"requestedAccessTokenVersion": 2`.
5. **Certificates & secrets** → New client secret → copy the **Value** into
   `AZURE_CLIENT_SECRET`; set `GRAPH_CLIENT_ID` = this app's client id.

### 5b. SPA app — "Governance Portal"
1. New registration → "Governance Portal" → platform **Single-page application**.
2. **Redirect URI** = your exact site origin (e.g. `https://governance.bir...com`,
   and/or `https://localhost` for testing).
3. **API permissions** → add the `access_as_user` scope from 5a → grant consent.
4. `SPA_CLIENT_ID` = this app's client id; `AZURE_TENANT_ID` = directory (tenant) id.

### 5c. Microsoft Graph (directory sync) — on the API app
API permissions → Microsoft Graph → **Application permissions** → add
`User.Read.All`, `GroupMember.Read.All`, `Application.Read.All`, and (for email)
`Mail.Send` → **Grant admin consent**.

### 5d. SharePoint — Sites.Selected (two steps)
1. API app → Graph → Application → add **`Sites.Selected`** → grant admin consent.
2. As a SharePoint/Global admin, in Graph Explorer grant read on the one site:
   - **POST** `https://graph.microsoft.com/v1.0/sites/<site-id>/permissions`
     ```json
     { "roles":["read"], "grantedToIdentities":[{ "application":{ "id":"<api-client-id>", "displayName":"Governance API" } }] }
     ```
   - Get `<site-id>` from `GET /sites/{hostname}:/sites/{path}` (format
     `host,siteGuid,webGuid`) → put it in `SHAREPOINT_SITE_ID`.

### 5e. Assign people (IAM)
Create Entra security groups `Governance-Admins` and `Governance-Managers`,
assign them to the matching app roles on the **Governance API** enterprise app
(Enterprise applications → Users and groups). Onboarding/offboarding = group
membership. (Group-to-role assignment needs Entra ID P1.)

## 6. TLS certificate
Put your cert + key in `deploy\certs\`:
- `fullchain.pem` (cert + intermediate chain)
- `privkey.pem` (private key)
For testing only, a self-signed pair works (browsers will warn) — see
`TLS-AND-PERMISSIONS.md`.

## 7. Build & run
```powershell
cd C:\governance-portal\deploy
docker compose up --build -d        # first build compiles the SPA; a few minutes
docker compose ps                   # db healthy, api + web up
docker compose logs --tail=20 api   # "Governance API listening on :8080"
```
A fresh database runs **all** schema + migrations + grants automatically — no
manual SQL. Open **https://localhost** (or your DNS name) and sign in.

## 8. First use
1. **Employees → Sync now** — imports users + groups + managers from the directory.
2. Map directory groups into platform/local groups, or add members directly.
3. Create policies (SharePoint) / upload trainings (managers), assign to groups,
   set deadlines and quizzes.
4. Allow inbound **443** (and **80**) in Windows Defender Firewall.

## 9. Going to production
- Drop or loopback-bind the DB port (already `127.0.0.1:5432`).
- Protect `deploy\.env`, `apps\api\.env`, `deploy\certs\` (BitLocker; tight ACLs).
- Schedule `deploy\scripts\backup-all.ps1` weekly (Task Scheduler snippet in the file).
- Consider the Azure-native model (Managed Identity + Key Vault + Private Endpoint) —
  see `ARCHITECTURE-DECISIONS.md` and `NEXT-STEPS.md`.
