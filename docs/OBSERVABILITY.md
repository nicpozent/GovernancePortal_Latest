# Observability — shipping logs to a SIEM

Step-by-step for getting the portal's logs off the box and into a central
store (Microsoft Sentinel / Azure Log Analytics by default, with Splunk / Elastic
/ Loki alternatives), plus what to alert on. This closes the ISO 27001 A.8.16
(monitoring) and GDPR Art.33 (breach detection) gap.

---

## 0. What the app already emits (know your inputs)

- **Structured JSON logs to stdout** via `pino` (`apps/api/src/logger.js`): one JSON
  object per line with `level`, `time` (ISO), `msg`, the request `req.id`
  (correlation id, also returned to clients as `x-request-id`), and `user` (the
  caller's `oid`). **Secrets are redacted** (`authorization`, `cookie`, `token`,
  `password`, `clientSecret`, …).
- **Docker captures stdout**; today it uses the `json-file` driver with rotation
  (`max-size: 10m`, `max-file: 5`) — logs live on the host only.
- **Audit events** additionally have two first-class channels
  (`Admin → Integrations`): a **push** webhook (`forward_url`) and a **pull** feed
  (`GET /feed/audit`, API-key auth). These carry the admin/compliance audit trail
  specifically and can go to a SIEM independently of the app logs.

There are two ways to centralize, and you can use both:
- **A. Ship all container logs** with a Fluent Bit collector (recommended — full
  coverage: API + DB + nginx).
- **B. Forward audit events only** using the built-in push/pull integration
  (lightweight; complements A or stands alone if you only need the audit trail).

---

## 0b. Metrics & health endpoints (built in)

Beyond logs, the API now exposes the three operational signals directly:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | **Liveness** — process is up. Static `{ok:true}`; does NOT touch the DB (a DB blip must not trigger a restart loop). The Docker `HEALTHCHECK` uses this. |
| `GET /readyz` | none | **Readiness** — checks the DB (`select 1`). `200` ready / `503` not ready, so a load balancer can drain an instance that lost its DB. |
| `GET /metrics` | none* | **Prometheus** exposition — RED metrics (`http_requests_total`, `http_request_duration_seconds` by method/route/status) + Node runtime metrics (CPU, heap, event-loop, GC). |

*`/metrics` and the probes are intentionally unauthenticated (a scrape agent has no
Entra token). They carry **no PII** — only counts/latencies with a *normalised* route
label (`/api/policies/:id/file`, never the raw id, so cardinality stays bounded).
**Restrict `/metrics` to your monitoring network at the edge** (nginx/Front Door);
it is not proxied publicly by the SPA's nginx config.

**Scrape it** (Prometheus / Azure Monitor managed Prometheus):
```yaml
scrape_configs:
  - job_name: governance-api
    metrics_path: /metrics
    static_configs: [{ targets: ['api:8080'] }]
```

**Alert examples (PromQL)** — complement the log-based KQL alerts below:
```promql
# p95 latency > 1s over 5m
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 1
# 5xx rate > 1% over 5m
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01
# instance not ready (scrape /readyz as a blackbox target, or alert on `up == 0`)
```

The container health of all three services is enforced by Docker `HEALTHCHECK`s
(db: `pg_isready`; api: `/healthz`; web/nginx: a local `/nginx-health` on :80).

---

## A. Ship all container logs with Fluent Bit (recommended)

This repo includes a ready overlay: `deploy/logging/fluent-bit.conf`,
`deploy/logging/parsers.conf`, and `deploy/docker-compose.logging.yml`. It runs a
Fluent Bit container and routes each service's stdout to it via the Docker
`fluentd` driver in **non-blocking** mode (the app never stalls if the collector
is down), parses the pino JSON, and forwards to your SIEM.

### Step 1 — Create/choose the destination workspace
**Microsoft Sentinel / Log Analytics (default):**
1. Azure portal → **Log Analytics workspaces** → create (or pick) a workspace in
   the right region/subscription. Enable **Microsoft Sentinel** on it if you want
   SIEM analytics.
2. Workspace → **Settings → Agents** → copy the **Workspace ID** and a
   **Primary key**.

### Step 2 — Put the credentials in `deploy/.env`
```dotenv
# Log Analytics (Data Collector API)
LA_WORKSPACE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
LA_SHARED_KEY=<primary key>
```
(These are read by `docker-compose.logging.yml` → the Fluent Bit container. Keep
them out of git — `deploy/.env` is already gitignored.)

### Step 3 — Start the stack **with** the logging overlay
```powershell
cd deploy
docker compose -f docker-compose.yml -f docker-compose.logging.yml up -d
```
`docker compose ps` should now show a `fluent-bit` service alongside db/api/web.

### Step 4 — Verify ingestion
1. On the box: `docker compose logs --tail=20 fluent-bit` — should show it started
   and is flushing (no auth errors).
2. Generate traffic (open the portal, hit `/healthz`).
3. In Log Analytics: **Logs** → query the custom table (the `Log_Type` becomes
   `GovernancePortal_CL`):
   ```kusto
   GovernancePortal_CL
   | order by TimeGenerated desc
   | take 50
   ```
   You should see rows with `level`, `msg`, `req_id_s`/`user_s`, `statusCode_d`.
   (First rows can take a few minutes to appear on a new table.)

### Switching sinks (Splunk / Elastic / Loki)
Edit `deploy/logging/fluent-bit.conf` — comment the `[OUTPUT] azure` block and
uncomment the one you want (Splunk HEC, `es`, or `loki`), then set its env vars in
`deploy/.env` and restart with the overlay. The collection/parse steps are
identical; only the output changes.

### How it's wired (for maintainers)
- `docker-compose.logging.yml` sets each service's `logging.driver: fluentd`
  (tagged `gov.api` / `gov.web` / `gov.db`) pointing at `127.0.0.1:24224`, with
  `fluentd-async: true` + `mode: non-blocking` so a collector outage can't block
  or crash the app containers.
- Fluent Bit's `forward` input receives them; the `parser` filter extracts the
  pino JSON from the Docker `log` field; the `azure` output ships to Log Analytics.
- The base `docker-compose.yml` is unchanged (still `json-file`) when you don't
  include the overlay — so this is fully opt-in and CI's smoke test is unaffected.

---

## B. Forward the audit trail via the built-in integration (optional)

For the **compliance audit events** specifically (who did what), no agent needed:

1. Sign in as an admin → **Integrations**.
2. **Push:** set the **forward URL** to your SIEM's HTTP ingestion endpoint and a
   bearer token, enable forwarding, and **Send test**. Every audit event is then
   POSTed as JSON (fire-and-forget; the URL is SSRF-guarded — no loopback/
   link-local). Check **last forward status**.
3. **Pull:** enable the feed and generate an API key; external systems poll
   `GET /feed/audit?since=<iso>` with `Authorization: Bearer <key>`.

Use B when you want the audit ledger in a system of record even if you haven't
deployed the log agent yet.

---

## Azure-native deployment (no agent needed)
If/when you move to **App Service / Container Apps**, container stdout is captured
by the platform — just enable **Diagnostic settings → send to Log Analytics**.
Skip Fluent Bit entirely; keep the pino JSON output as-is.

---

## What to alert on (create these in Sentinel/your SIEM)

Minimum viable alert set (example KQL for Log Analytics):

| Alert | Signal | Example |
|-------|--------|---------|
| Auth-failure spike | many 401/403 | `GovernancePortal_CL \| where level_s=="warn" or statusCode_d in (401,403) \| summarize c=count() by bin(TimeGenerated,5m) \| where c>50` |
| Server errors | 5xx rate | `GovernancePortal_CL \| where statusCode_d>=500 \| summarize count() by bin(TimeGenerated,5m)` |
| Unhandled crash | process error | `GovernancePortal_CL \| where msg_s in ("uncaughtException","unhandledRejection")` |
| Feed abuse | unauthorized feed hits | `GovernancePortal_CL \| where msg_s=="feed/audit unauthorized"` |
| Sync/backup failure | job errors | `GovernancePortal_CL \| where msg_s has_any ("auto-sync","auto-backup","backup_failed")` |
| Cert expiry | run the diagnostics `web` group on a schedule | see `apps/api/tools/diagnostics` |

Wire alerts to email/Teams/PagerDuty. Pair with an uptime check on
`https://<host>/healthz`.

---

## Retention & privacy
- Set the workspace **retention** to match your log-retention policy.
- Logs are redacted of secrets, but they contain a caller `oid` and audit rows
  contain actor name + IP — treat the log store as **personal data** (GDPR): state
  it in the RoPA and privacy notice, and apply the same retention/access controls.

## Troubleshooting
- No data in Log Analytics: `docker compose logs fluent-bit` for auth/network
  errors; confirm `LA_WORKSPACE_ID`/`LA_SHARED_KEY`; new custom tables take a few
  minutes to first appear.
- App containers won't start after enabling: ensure `fluentd-async: "true"` is set
  (it is, in the overlay) so the driver never blocks; check the collector is up.
- Fields not parsed (everything in one `log` string): confirm `parsers.conf` is
  mounted and the `pino_json` parser name matches the filter.
