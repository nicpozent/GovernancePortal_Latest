# TLS & Microsoft Graph permissions

Everything needed to serve the portal over HTTPS and let the API read SharePoint.
IDs below are already filled in for this tenant.

| Thing | Value |
|---|---|
| Tenant ID | `66cdb438-f45a-45bb-9709-cfede80e5fc3` |
| API app (Governance API) | `655463e2-ab20-45b2-8bd2-be9925be19dd` |
| SPA app (Governance Portal) | `b9f3bd3f-f945-4060-80eb-f5269c3499c4` |
| Global IT site id | `birgmabiltema.sharepoint.com,9bf2176d-1e99-4b99-bc81-6818182490ad,c74afaa5-e61b-4d88-baa1-6b21a73565a6` |

---

## 1. TLS (HTTPS) on the web container

The `web` container listens on **80 and 443**. Port 80 redirects to 443.
Certs are **mounted at runtime** from `./certs` — never baked into the image.

### 1a. Get a certificate for your DNS name
You need two PEM files for e.g. `governance.biltemabirgma.com`:

- `fullchain.pem` — server cert **+ issuing CA chain**
- `privkey.pem`   — the private key

Sources:
- **Internal CA (typical):** request a server cert from your PKI team. Ensure client
  machines trust the internal CA (usually via GPO), or browsers warn.
- **Public cert:** win-acme (Let's Encrypt for Windows) or a purchased cert.
- **Lab / test only (self-signed):** from this folder, in PowerShell:
  ```powershell
  mkdir certs
  wsl openssl req -x509 -newkey rsa:2048 -nodes -days 825 `
    -keyout certs/privkey.pem -out certs/fullchain.pem `
    -subj "/CN=governance.biltemabirgma.com" `
    -addext "subjectAltName=DNS:governance.biltemabirgma.com"
  ```
  (Browsers warn that it's untrusted — fine for testing, not production.)

### 1b. Place the files
In the SAME folder as `docker-compose.yml`:
```
certs\fullchain.pem
certs\privkey.pem
```
The names must match exactly (compose mounts `./certs` → `/etc/nginx/certs`).

### 1c. Build / restart
```powershell
docker compose up --build -d
```
Test: open `https://governance.biltemabirgma.com`.
`http://...` should 301-redirect to `https://...`.

### 1d. Entra redirect URI must match
On the **Governance Portal (SPA)** app registration → Authentication →
Single-page application → redirect URIs, add the EXACT https origin:
```
https://governance.biltemabirgma.com
```
Entra rejects non-https redirect URIs (except localhost), so login only works
once TLS is live at the real hostname.

### 1e. Firewall
Allow inbound TCP **443** (and **80** for the redirect) on the VM's Windows
Defender Firewall.

---

## 2. Microsoft Graph — directory sync + SharePoint reads

The API authenticates to Graph with a client id + secret (there is no Managed
Identity on a VMware VM). In `birgma-governance/.env`:
```
GRAPH_CLIENT_ID=655463e2-ab20-45b2-8bd2-be9925be19dd   # = the API app
AZURE_CLIENT_SECRET=<secret Value generated on that app registration>
```
> Generate the secret at: App registrations → Governance API →
> Certificates & secrets → New client secret → copy the **Value**.
> Never commit it; keep it only in `.env`.

### 2a. Directory sync permissions (for employee/group import)
On the **Governance API** app → API permissions → Microsoft Graph →
**Application permissions**, add (then **Grant admin consent**):
- `User.Read.All`
- `GroupMember.Read.All`
- `Application.Read.All`   (only if using the app-registration sync tier)

### 2b. SharePoint access — Sites.Selected (two steps)

**Step 1 — add the capability:**
App registrations → Governance API → API permissions → Microsoft Graph →
Application permissions → add **`Sites.Selected`** → **Grant admin consent**.
(This alone grants access to NO sites — that's intentional.)

**Step 2 — grant read on the Global IT site only:**
In Graph Explorer (https://developer.microsoft.com/graph/graph-explorer),
signed in as a SharePoint/Global admin:

- Method: **POST**
- URL:
  ```
  https://graph.microsoft.com/v1.0/sites/birgmabiltema.sharepoint.com,9bf2176d-1e99-4b99-bc81-6818182490ad,c74afaa5-e61b-4d88-baa1-6b21a73565a6/permissions
  ```
- **Request body** tab (must not be empty — that causes "Empty Payload"):
  ```json
  {
    "roles": ["read"],
    "grantedToIdentities": [
      {
        "application": {
          "id": "655463e2-ab20-45b2-8bd2-be9925be19dd",
          "displayName": "Governance API"
        }
      }
    ]
  }
  ```
- Expect **201 Created**.

PowerShell alternative:
```powershell
Connect-MgGraph -Scopes "Sites.FullControl.All"
New-MgSitePermission -SiteId "birgmabiltema.sharepoint.com,9bf2176d-1e99-4b99-bc81-6818182490ad,c74afaa5-e61b-4d88-baa1-6b21a73565a6" `
  -Roles @("read") `
  -GrantedToIdentities @(@{ Application = @{ Id = "655463e2-ab20-45b2-8bd2-be9925be19dd"; DisplayName = "Governance API" } })
```

### 2c. Notes
- `Sites.Selected` + a site-level grant covers **every library and folder**
  inside that site — policies nested in document-library folders need no extra
  config. The app resolves documents by drive item id, not by folder path.
- When adding a policy in the portal, paste the link to the **file**, not a folder.
- Grant **`read`** only — the app never writes to SharePoint.

---

## 3. Quick verification
```powershell
docker compose ps                  # db, api, web all healthy
curl https://<your-name>/healthz   # -> {"ok":true}  (use -k for self-signed)
docker compose logs api            # watch for Graph 403s (means 2b didn't take)
```
Open a policy in the portal → if the version label + "open in SharePoint"
resolve, Graph + SharePoint access is working.
