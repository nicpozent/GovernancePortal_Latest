# Independent Code Review — Birgma Governance Portal

_Date: 2026-06-29 · Scope: full repository (`apps/api`, `apps/web`, `deploy`, `db`, docs)._
_Frameworks applied: OWASP ASVS / Top-10, CWE, NIST SSDF (PW/PO practices), ISO 27001 A.8.25–8.28 secure-development controls. This complements — and does not duplicate — the existing `docs/SECURITY-REVIEW.md` and `REVIEW.md`; it focuses on findings **not** already tracked there._

## Verdict

The application layer is **genuinely solid** and clearly built with security in mind: delegated-only Entra token validation (signature/issuer/audience/tenant/scope), server-side RBAC on every route, fully parameterized SQL, DB-enforced append-only ledgers, an upload allowlist with server-determined content types, escaped HTML in the print receipt, and a tight CSP. The code is unusually well-commented and the existing review docs are honest about hosting-layer residual risk.

The findings below are mostly **medium/low** correctness, consistency, and hygiene items, plus one **documentation-vs-reality gap** that undercuts a control the docs claim is in place. None are critical; none are architectural.

---

## Findings

### H-1 · `.gitignore` and `.env.example` are missing, but documented as present
`REVIEW.md` (M3) states *".gitignore added at repo root"* and `README.md` references `.env.example` / `apps/api/.env.example` as tracked templates. **Neither file is actually tracked** (`git ls-files` shows none). Nothing secret is currently committed, so this is not an active leak — but the protective control is absent while the docs assert it exists. Without `.gitignore`, a routine `git add -A` can sweep in `deploy/.env`, `deploy/certs/`, `backups/`, or `uploads/`.
- **Action:** add the `.gitignore` described in M3 and the two `.env.example` templates, or correct the docs. (CWE-312 / SSDF PW.4, PO.5.)

### M-1 · Reminder emails are sent for unassigned (private) policies the recipients cannot read
`apps/api/src/services/reminders.js:75-77` treats a policy with **no** `policy_groups` as "required by every active employee". But the M5 hardening made unassigned policies **private** — `canRead()` (`routes.js:448-466`) returns true only for admin/owner, and the employee `/policies` query (`routes.js:107-115`) hides them. Net effect: an unassigned policy generates "Action required" emails to the **entire active workforce** for a document none of them can open or sign. The semantics of "unassigned" now disagree across four places (employee list = hidden, `canRead` = private, dashboard `required` = 0, reminders = everyone). Pick one model and apply it consistently; reminders should almost certainly drop the unassigned union. (Correctness / information-consistency.)

### M-2 · Unescaped interpolation into outbound email HTML (HTML injection)
The print receipt is correctly escaped via `esc()`, but the email builders are not. `services/reminders.js:37-42` and `:127-131` interpolate `policy`, `version`, `display_name`/`owner_name` raw; `routes.js:178-184` (sign-confirmation) interpolates `row.policy`, `row.display_name`, and the fully user-controlled `fullName` directly into HTML. Policy names are admin-supplied and `fullName` is end-user-supplied at signing time, so a `<...>`/`<a href>` payload lands unescaped in recipients' inboxes. Impact is bounded (modern mail clients sandbox HTML and strip scripts), but it is still untrusted-input-into-markup. Add an HTML-escape helper on the API side and use it for every interpolated value. (CWE-79 variant / OWASP A03.)

### M-3 · `/feed/audit` is exempt from rate limiting
The rate limiters are bound to `/api` and `/api/sync` (`server.js:43-45`), but `/feed/audit` is registered at the root (`server.js:52`), so it has **no** throttling. The constant-time key compare is good and a 48-hex-char key is not brute-forceable, but an unauthenticated caller can hammer the endpoint (each hit runs a DB query) with no backpressure and no failed-attempt logging. Add a dedicated limiter and log auth failures on this route. (OWASP A04 / API4:2023.)

### M-4 · Authenticated SSRF via admin-configured forward URL
`logger.forwardEvent()` POSTs every audited event to the admin-set `forward_url` (`routes.js:982-1012`, `logger.js:34`). It is admin-gated and therefore low-risk, but a compromised or careless admin can point the server at internal metadata/SSRF targets (`169.254.169.254`, internal services). Consider an allowlist scheme (https only), blocking link-local/RFC-1918 ranges, and documenting it as a known authenticated capability. (CWE-918.)

### L-1 · No input validation on path/route params → 500s instead of 400s
Routes pass `req.params.id` straight into UUID-typed queries (e.g. `routes.js:136`, `:574`, `:593`). A malformed id throws a Postgres cast error that surfaces as a generic 500 rather than a clean 400. Queries are parameterized so there is **no injection risk** — this is error-quality and noise-in-logs. A small UUID-format guard (or `try/catch`→400) tidies it up. (OWASP A04 input validation.)

### L-2 · Quiz-attempt limit is a check-then-insert race (TOCTOU)
`routes.js:656-683` reads prior attempts, enforces "≤3 / not already passed", then inserts — with no transaction or row lock. Concurrent submissions can exceed three attempts or double-record a pass. Low impact (self-service quiz), but wrap the read+insert in a transaction with `select … for update` on the attempt set, or enforce a uniqueness/`attempt_no` constraint. (CWE-367.)

### L-3 · `pg_dump` receives the connection string (with password) as an argv
`server.js:98`, `routes.js:908`, `:938` spawn `pg_dump` with `cfg.databaseUrl` as a CLI argument, so the DB password is visible in the container's process list (`/proc/*/cmdline`, `ps`). Prefer `PGPASSWORD`/`.pgpass` or `PGSERVICEFILE` via the child env so the secret never appears in argv. (CWE-214.)

### L-4 · Dependency & build reproducibility
No `package-lock.json` in either app; both Dockerfiles run `npm install` (not `npm ci`) — already noted in the Dockerfile comments and ISO map (A.8.9), but it remains open. Dependencies use floating `^` ranges, and `multer@1.4.5-lts.1` is on the legacy 1.x line. Commit lockfiles, switch to `npm ci`, and add `npm audit` (or Dependabot) to CI. (NIST SSDF PW.4/PS.1 / OWASP A06.)

### L-5 · Process-level error handlers keep a possibly-corrupt process alive
`server.js:14-15` log `uncaughtException`/`unhandledRejection` but never exit. After an uncaught exception Node's state may be undefined; best practice is to log, then exit non-zero and let `restart: unless-stopped` recycle the container. The per-route async wrapper (`routes.js:25-33`) is a nice touch and handles the common case — this is only about the truly-unexpected path. (Reliability / SSDF PW.5.)

### L-6 · Minor token/DB hardening
- `auth.js:31-40` sets no `clockTolerance` on `jwt.verify`; a few seconds of skew tolerance avoids spurious 401s.
- `auth.js:40` returns `detail: err.message` on invalid tokens — handy for debugging, but leaks validation specifics ("jwt expired", "audience invalid"). Consider gating behind a debug flag.
- `db.js:4-11` sets pool `max`/idle but no `statement_timeout` / `connectionTimeoutMillis`; a slow query can pin a connection. Add timeouts.

### L-7 · Committed runtime-config fallback carries a real tenant's identifiers
`apps/web/public/config.js:5-8` ships concrete `TENANT_ID`/`SPA_CLIENT_ID`/`API_CLIENT_ID` values. These are **not secrets** (public client/tenant identifiers), and the container regenerates the file from env at startup, but baking one tenant's IDs into the repo as the default invites confusion and accidental cross-tenant testing. Use empty placeholders. (Hygiene.)

---

## Maintainability, structure & comments

- **Comments: above average.** Almost every module opens with a clear rationale block, and security-relevant decisions (delegated-only tokens, server-determined content type, append-only revokes, least-privilege Graph scopes) are explained at the point of use. This is a real strength — keep it.
- **`routes.js` is a ~1,200-line monolith.** It mixes employees, policies, trainings, quizzes, groups, dashboards, reports, backups, integrations, and SharePoint browsing. Split into per-domain routers (`routes/policies.js`, `routes/quizzes.js`, …) for navigability and smaller review surfaces. The shared helpers (`audit`, `canRead`, `canManage`, `teamOids`) belong in a `services`/`authz` module.
- **No automated tests and no CI pipeline** (`.github/workflows` absent). For a compliance system of record, the authorization helpers (`canRead`/`canManage`/`teamOids`), quiz grading, and the "required vs signed" SQL are exactly the logic that should be unit/integration-tested. This is the single biggest gap against NIST SSDF (PW.7/PW.8) and ISO A.8.29. Add a test harness (the DB logic is testable against a throwaway Postgres) and a CI job running lint + tests + `npm audit` + a container build.
- **Repeated effective-membership CTE.** The `eff`/`eff_members` union (employee_groups ∪ group_effective_members) is copy-pasted across ~7 queries. Extract it into a SQL view (you already have `group_effective_members`) to guarantee all compliance numbers use identical membership semantics — and to prevent the M-1-style drift.
- **Magic numbers.** `maxAttempts: 3`, retention `14`, idle `15 min`, `250 MB`, rate limits — centralize in `config.js` so policy is configurable and discoverable.
- **No API contract.** An OpenAPI/Swagger description would document the surface and enable contract testing; useful given an external integrations feed already exists.

## What's done well (worth preserving)

- Delegated-token enforcement with tenant pinning and explicit app-only rejection (`auth.js`) — a genuinely correct, frequently-missed control.
- DB-level append-only ledgers via `REVOKE update,delete` on a least-privilege role, with the revokes deliberately last (`docker-grants.sql`) — integrity enforced by the database, not just the app.
- Least-privilege Microsoft Graph posture (`Sites.Selected`, assigned-principals-only sync, SCIM zero-Graph option) is well-reasoned and documented.
- Output handling: server-determined content type + `nosniff` + `Content-Disposition` sanitization on file serving; escaped print receipt; strong CSP and security headers in both nginx and helmet.
- Honest, framework-mapped security documentation (STRIDE / ATT&CK / ISO / GDPR) that names residual risk instead of hiding it.

## Suggested priority order

1. **H-1** — restore/commit `.gitignore` + `.env.example` (or fix the docs). _Small, removes a latent secret-leak path._
2. **M-1** — make "unassigned policy" mean one thing; fix the reminder fan-out.
3. **M-2** — HTML-escape all email interpolation.
4. **M-3 / M-4** — rate-limit + log `/feed/audit`; constrain `forward_url`.
5. **Tests + CI** — authz helpers, quiz grading, compliance SQL; lock dependencies and run `npm audit`.
6. **L-1…L-7** — incremental hardening and cleanup.

_Independent technical review; not a formal audit or legal advice._
