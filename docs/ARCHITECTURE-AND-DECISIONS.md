# Birgma Governance Portal — Architecture & Decision Record

_This is the **single source of truth** for the system's architecture. Part I
describes how the application is architected (topology, request lifecycle, auth,
data model, integrity, resilience); Part II is the full decision record — for each
choice: the reasoning, the alternatives weighed and rejected, the trade-offs
accepted, and the code that implements it. The reusable capability catalogue lives
in its companion [`ARCHITECTURE-BUILDING-BLOCKS.md`](ARCHITECTURE-BUILDING-BLOCKS.md)
(TOGAF ABBs)._

Audience: engineers and reviewers who need to understand **why** the system is
shaped the way it is before changing it. Every decision below follows the same
shape — **Context → Decision → Alternatives considered → Trade-offs →
Consequences** — and is grounded in the actual code.

---

# Part I — How the application is architected

## 1. One sentence

A three-tier, single-tenant compliance system where **identity is fully delegated
to Microsoft Entra ID**, a **stateless Node/Express API** is the only component
trusted to make authorization decisions and touch data, and **PostgreSQL enforces
the integrity guarantees** (append-only ledgers) at the privilege level rather
than trusting application code.

## 2. Topology

```
Browser (React SPA + MSAL.js)
   │  HTTPS, Authorization: Bearer <Entra access token>
   ▼
web tier — nginx          TLS termination · security headers/CSP · serves the SPA
   │  proxy_pass /api  (same origin → no CORS)
   ▼
app tier — Node/Express   token validation · RBAC · all domain logic · the ONLY
   │                       component that talks to the DB, Graph and SharePoint
   ├── PostgreSQL 16       schema-owning superuser; app connects as a non-owner,
   │                       least-privilege role; compliance tables append-only
   ├── Microsoft Graph     app-only (Managed Identity in prod): directory sync,
   │                       SharePoint reads, sendMail
   └── volumes             /uploads (training files), /backups (pg_dump output)
```

All three tiers are containers on one Docker host; inter-tier traffic never leaves
the internal Docker network. The browser only ever speaks to nginx, and only ever
on the same origin — which is why there is no CORS dance in normal operation.

## 3. The request lifecycle, end to end

Follow a single authenticated call — say `POST /api/policies/:id/quiz/attempt`:

**(a) The SPA acquires a token and attaches it.** MSAL silently refreshes the
access token and the thin `request()` client adds the bearer header
(`apps/web/src/app.jsx`):

```js
async function getToken() {
  await initAuth();
  const account = msalApp.getActiveAccount();
  if (!account) { await msalApp.loginRedirect(loginRequest); return null; }
  try {
    const r = await msalApp.acquireTokenSilent({ ...loginRequest, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof window.msal.InteractionRequiredAuthError) {
      const r = await msalApp.acquireTokenPopup(loginRequest);  // fallback
      return r.accessToken;
    }
    throw e;
  }
}
```

**(b) nginx forwards same-origin to Node.** The browser calls `/api/...` on its own
origin; nginx reverse-proxies to the API container, so the SPA never makes a
cross-origin request and no preflight is needed (`apps/web/nginx.conf`):

```nginx
location /api/ {
  proxy_pass http://api:8080;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**(c) The middleware chain runs in a deliberate order** (`apps/api/src/app.js`):
`helmet()` (headers) → `cors()` (defense-in-depth even though same-origin) →
`express.json({ limit: '256kb' })` (body cap) → rate limiters → route. Then every
`/api` route passes through `requireAuth` before any handler.

**(d) The token is verified server-side** (see §4). Identity is taken from the
*verified* token, never from the request body.

**(e) The handler authorizes, then acts** (see §5), runs its SQL through the shared
pool, writes an audit row, and returns JSON. A response is never trusted to the
client for identity or authorization — those are recomputed every call.

**(f) Errors converge on one handler.** Route handlers are wrapped so a rejected
promise becomes a clean 500 with a correlation id rather than crashing the process
(`apps/api/src/routes/index.js`):

```js
['get', 'post', 'put', 'delete', 'patch'].forEach((m) => {
  const orig = r[m].bind(r);
  r[m] = (path, ...handlers) =>
    orig(path, ...handlers.map((h) =>
      typeof h === 'function' && h.length < 3
        ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
        : h));
});
```

This monkey-patch is an intentional architectural choice: it lets every handler be
written as a plain `async` function with no `try/catch` boilerplate, while still
guaranteeing rejections reach the central error handler. The cost is a little
"magic" — a reader has to know this wrapper exists.

## 4. Authentication & token validation

The API trusts exactly one thing: a correctly-signed Entra access token. The
hardening in `requireAuth` is the security spine of the whole system
(`apps/api/src/auth.js`):

```js
jwt.verify(token, getKey, {
  audience: [cfg.apiClientId, cfg.apiAudience],
  issuer: cfg.issuer,
  algorithms: ['RS256'],          // pin the alg — defeats "alg: none"/HS256 confusion
  clockTolerance: 5,
}, (err, claims) => {
  if (err) return res.status(401).json({ error: 'invalid_token', ... });
  if (claims.tid && claims.tid !== cfg.tenantId)          // 1) our tenant only
    return res.status(401).json({ error: 'invalid_token', detail: 'wrong_tenant' });
  const scopes = (claims.scp || '').split(' ').filter(Boolean);
  // 2) must be a DELEGATED user token — reject app-only tokens even if they
  //    carry an app role, so a service principal can't act as an admin.
  if (claims.idtyp === 'app' || !scopes.includes('access_as_user'))
    return res.status(403).json({ error: 'insufficient_scope' });
  req.user = { oid: claims.oid, name: claims.name, upn: claims.preferred_username,
               roles: claims.roles || [], scopes };
  next();
});
```

Five independent checks must all pass: **signature** (against Entra's JWKS, keys
cached), **issuer**, **audience**, **tenant**, and **delegated-scope**. The
app-only rejection (`idtyp === 'app'`) is the subtle, important one — it stops a
machine credential that happens to hold the `Governance.Admin` app role from
authenticating as if it were a human admin.

## 5. The three-layer authorization model

Authorization is **not** a single role check. It composes three independent
layers, and a handler picks the ones it needs:

1. **Role** — Entra app roles, checked by middleware (`requireAdmin`,
   `requireManager`). Coarse capability gate.
2. **Ownership** — managers may act only on content they own
   (`policies.owner_oid === req.user.oid`), enforced by `canManage`.
3. **Effective membership** — an employee may *read* a document only if it applies
   to them, enforced by `canRead`.

`canRead` is where the "private-by-default" rule (ADR-010) lives
(`apps/api/src/authz.js`):

```js
async function canRead(req, policyId) {
  if (isAdmin(req)) return true;
  const p = (await pool.query('select owner_oid from policies where id=$1', [policyId])).rows[0];
  if (!p) return false;
  if (p.owner_oid && p.owner_oid === req.user.oid) return true;   // owner
  const r = await pool.query(`
    select 1 where exists (
      select 1 from policy_groups x
        join ( /* effective membership */
          select eg.group_id, eg.employee_oid from employee_groups eg join groups gg on gg.id=eg.group_id and gg.archived_at is null
          union
          select gem.group_id, gem.employee_oid from group_effective_members gem join groups gg on gg.id=gem.group_id and gg.archived_at is null
        ) em on em.group_id = x.group_id
       where x.policy_id = $1 and em.employee_oid = $2)
    limit 1`, [policyId, req.user.oid]);
  return r.rowCount > 0;
}
```

That `employee_groups ∪ group_effective_members` union is **effective
membership** — direct local-group membership plus directory groups rolled up
through platform-group mappings. It is the single most important expression in the
domain. It was originally inlined in ~11 queries (the dashboard, reports,
reminders, the employee policy list, `canRead`), and one copy diverging was the
root cause of finding M-1 — reminders to people who couldn't read the doc. It is
now defined **once** as the database view `effective_group_membership`
(`db/migration_018_effective_membership.sql`), and every query selects from it, so
the semantics can no longer drift.

## 6. Data model & domain layers

| Layer | Tables | Owns |
|------|--------|------|
| Identity & directory | `employees`, `groups`, `employee_groups`, `group_mappings`, view `group_effective_members` | who exists, who belongs where |
| Policy management | `policies`, `policy_groups`, `policy_versions` | what must be acknowledged, by whom |
| Knowledge checks | `quizzes`, `quiz_questions`, `quiz_attempts` | comprehension gating before signing |
| Compliance ledger | `signatures` | the immutable system of record |
| Notifications | `notifications_sent` | who was told, and when (idempotency) |
| Audit & ops | `audit_log`, `sync_runs`, `integration_config` | accountability, recoverability, integrations |

The `groups` table is polymorphic by `kind` (`Platform` / `Directory` / `Local`)
and `source` (`Entra ID` / `Local`), which lets one membership model serve
Entra-synced groups, admin-curated local groups, and roll-up platform groups.

## 7. The integrity model: enforced by the database, not the app

The compliance value of the system rests on one claim: *signatures and audit
entries cannot be altered or deleted.* That claim is **not** enforced by being
careful in application code — it is enforced by the database privilege system. The
app connects as a non-owner role that is *granted* insert/select but has
update/delete *revoked* on the ledgers (`apps/api/db/docker-grants.sql`):

```sql
grant select, insert, update, delete on all tables in schema public to governance_app;
-- ...then, last, remove the destructive rights on the ledgers so an earlier
-- blanket grant can't re-enable them:
revoke update, delete on signatures    from governance_app;
revoke update, delete on audit_log     from governance_app;
revoke update, delete on quiz_attempts from governance_app;
```

This is the difference between "we promise not to edit history" and "the
credential the app runs as is physically incapable of editing history." Even a
SQL-injection bug or a rogue code path cannot rewrite a signature. Corrections are
modelled as **new rows**, which is the correct shape for an audit ledger anyway.

## 8. Concurrency & consistency

The API is stateless and shares a single bounded connection pool
(`apps/api/src/db.js`, `max: 10`, with statement/idle timeouts so a stuck query
can't pin a connection). Most endpoints are single statements and rely on
Postgres for atomicity. Where a check-then-write spans statements and a race would
violate an invariant, the code takes an explicit lock. The quiz-attempt cap is the
clearest example (`apps/api/src/routes/quizzes.js`):

```js
const client = await pool.connect();
try {
  await client.query('begin');
  // serialize concurrent submissions for the same (user, policy)
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${req.user.oid}:${req.params.id}`]);
  const prior = (await client.query('select attempt_no, passed from quiz_attempts where policy_id=$1 and user_oid=$2', [req.params.id, req.user.oid])).rows;
  if (prior.some((a) => a.passed)) { await client.query('rollback'); return res.status(409).json({ error: 'already_passed' }); }
  if (prior.length >= cfg.quizMaxAttempts) { await client.query('rollback'); return res.status(403).json({ error: 'no_attempts_left' }); }
  await client.query(`insert into quiz_attempts (...) values (...)`, [...]);
  await client.query('commit');
} finally { client.release(); }
```

A transaction-scoped advisory lock was chosen over a serializable transaction
(cheaper, no retry loop) and over a unique constraint alone (which would surface
as an ugly duplicate-key error rather than a clean `409`).

## 9. Background work

Two jobs run **in-process** on `setInterval` timers, kicked off shortly after
boot (`apps/api/src/server.js`): a daily `pg_dump` backup with retention, and a
daily directory sync + reminder pass. This is a deliberate simplicity choice for a
single-instance deployment (ADR-114) — no external scheduler, no queue. The
trade-off is explicit: timers reset on restart.

**Multi-instance safety (HA step 2).** Each tick now runs under a Postgres
**advisory lock** (`apps/api/src/leader.js`, `withLeaderLock`): every replica's
timer fires, but only the one that wins `pg_try_advisory_lock` actually runs the
job — the rest skip. The lock is held for the whole job (so a slow backup can't be
double-started) and is tied to the DB session, so if the leader dies mid-job the
lock frees and the next tick on any replica takes over. `SCHEDULERS_ENABLED` is now
just a per-instance kill-switch — leave it `true` on every replica when scaling out.
This removes the "extract into a singleton/cron first" blocker; a queue-backed
scheduler is still the eventual target for very large fleets.

Idempotency for reminders is achieved in data, not in the scheduler: each
(policy, user, version, milestone) is recorded in `notifications_sent`, so a
re-run never re-sends the same milestone.

## 10. Configuration (12-factor for a static SPA)

The API reads config from the environment (`dotenv`). The SPA has the same need
but is *static files* with no server process — solved by **generating a tiny
config script from env at container start** (`apps/web/40-envconfig.sh`):

```sh
cat > /usr/share/nginx/html/config.js <<EOF
window.APP_CONFIG = {
  TENANT_ID: "${AZURE_TENANT_ID}", SPA_CLIENT_ID: "${SPA_CLIENT_ID}",
  API_CLIENT_ID: "${API_CLIENT_ID}", API_BASE: "${API_BASE}"
};
EOF
```

`index.html` loads `config.js` as a classic script *before* the deferred module
bundle, so `window.APP_CONFIG` is set in time. This keeps the **same built image**
promotable across environments (dev/test/prod) with only env changes — you never
rebuild to repoint a tenant.

## 11. Failure handling & resilience

- **Per-handler rejection capture** (§3) keeps one bad request from crashing Node.
- **`uncaughtException` exits the process** (after flushing the log) so the
  container's `restart: unless-stopped` policy recycles into a clean state rather
  than limping along in an undefined one.
- **Fire-and-forget side effects** (confirmation emails, outbound event
  forwarding) are wrapped so they can never fail the primary request.
- **Health probe** (`/healthz`) backs the Docker `HEALTHCHECK` and platform
  liveness.

## 12. Capabilities (ABBs) this architecture realizes

Each component above realizes one or more **Architecture Building Blocks** —
technology-neutral capabilities — implemented by the concrete **Solution Building
Blocks** named here. The full catalogue (with interfaces, dependencies, standards
and maturity) lives in the
[Architecture Repository](../architecture-repository/CATALOG.md); this table is the
quick bridge from "where it is in the code" to "what capability it provides".

| Component / tier (this doc) | Capabilities needed (ABBs) | Realizing SBB |
|---|---|---|
| §4 Token validation | A1 Identity Federation/Token Validation | `auth.js` + Entra (T1) |
| §5 Authorization | A2 Policy Decision Point; B5 Delegated Management | `requireAdmin/Manager`, `canRead/canManage`, `teamOids` |
| §3 Edge / proxy | A3 Edge/API Gateway | nginx + helmet + rate limiting (T2) |
| SPA | A4 Presentation/Experience | React + MSAL (T1 to sign in) |
| §7 Integrity | D3 Attestation Ledger; D4 Audit Ledger; B2 Attestation; B8 Accountability | `signatures`, `audit_log` (append-only via grants, T4) |
| §6 Domain data | D1 Identity Master; D2 Obligation Catalogue; B1 Policy Lifecycle; B4 Targeting | `employees`/`groups`, `policies`/`policy_groups`, `effective_group_membership` |
| Quizzes | B3 Competency Verification; D5 Results Store | `quizzes`/`quiz_attempts` |
| §9 Background work | A10 Scheduling; B6 Notification; A9 Backup | in-process timers, reminder engine, `pg_dump` |
| Integrations | A5 Directory Sync; A6 Content Broker; A7 Notification; A8 Eventing; A11 Observability | Graph sync/SharePoint/sendMail (T6), feed/forward, pino (T8) |
| Platform | T1 IdP · T3 Runtime · T4 RDBMS · T5 Storage · T6 Directory/Collab · T7 Secrets · T8 SIEM | Entra · Node/Docker · PostgreSQL · volume · Graph · Key Vault (target) · SIEM |

Reading guide: **T-domain ABBs are enterprise-shared services this solution
*consumes*** (IdP, directory/collab, secrets, SIEM); the **Business and Data ABBs
are the solution-specific value**; the **Application ABBs (A1/A2/A5/A9…) are
reusable building blocks** other Birgma solutions can adopt.

---

# Part II — Decision records (with trade-offs)

> Status of each: **Accepted** unless noted. Where a newer decision changed the
> stack (Node 22, Vite 8, multer 2), it is recorded here as the current state.

## ADR-101 — Delegate identity to Microsoft Entra ID
**Context.** Birgma/Biltema is a Microsoft 365 tenant; every user already has a
managed work account, and the org already runs MFA/Conditional Access there.
**Decision.** The app holds **no passwords and no user store of record**. All
authentication is Entra (OIDC/OAuth2, PKCE); authorization is driven by Entra app
roles.
**Alternatives considered.** (a) *Custom username/password auth* — rejected: it
would make the app a credential store and a breach target, and duplicate lifecycle
management. (b) *Auth0/Okta* — rejected: another vendor and bill for an identity
the org already owns. (c) *AD FS / on-prem* — rejected: legacy relative to Entra,
worse token story.
**Trade-offs.** Hard runtime dependency on Entra availability and on correct
app-registration setup; group-based role assignment needs Entra ID P1. If Entra is
down, no one signs in (accepted — same as the rest of M365).
**Consequences.** Onboarding/offboarding is *group membership*, not app
administration; MFA is an org policy, not app code.

## ADR-102 — Validate tokens with `jsonwebtoken` + `jwks-rsa` (not a full auth middleware)
**Context.** The API must verify Entra JWTs on every call.
**Decision.** Hand-roll a small `requireAuth` over `jsonwebtoken` + `jwks-rsa`,
pinning algorithm/issuer/audience/tenant/scope (§4).
**Alternatives considered.** (a) *`passport-azure-ad`* — heavier, historically
slow to track Entra v2 changes, more surface than needed. (b)
*`express-oauth2-jwt-bearer`* — good, but the explicit version makes the exact
checks (especially the `idtyp=app` rejection) visible and auditable in ~40 lines.
(c) *A reverse-proxy auth layer (oauth2-proxy)* — adds an extra hop and externalizes
the most security-critical logic.
**Trade-offs.** We own the validation code (must keep it correct) in exchange for
total clarity and minimal dependencies. The trade is justified because token
validation is the security spine — being explicit beats being terse here.

## ADR-103 — React 19 SPA with the **classic** JSX runtime
**Context.** A single, fairly dense admin/employee UI; no SEO requirement (it's an
authenticated internal tool).
**Decision.** React 19 as a client-rendered SPA (upgraded from 18 as a routine
dependency-currency bump, verified compatible). JSX uses the **classic** runtime
(`React.createElement`, explicit `import React`) — see `vite.config.js`.
**Alternatives considered.** (a) *Angular/Vue* — fine choices; React chosen for
team familiarity and the MSAL React ecosystem. (b) *Server-side rendering / Next.js*
— rejected: SSR buys nothing for an authenticated internal app and would add a
Node rendering tier and hydration complexity. (c) *Automatic JSX runtime* —
deliberately not adopted: classic mirrors the original CDN/Babel setup, keeps
`window.msal` global wiring simple, and avoided churn during the build migration.
**Trade-offs.** Client rendering means a JS bundle to download (mitigated:
hashed/immutable assets, gzipped ~90 kB app chunk) and no HTML-without-JS. Classic
JSX is slightly more verbose (explicit React import) than automatic.
**Consequences.** The whole UI is one `app.jsx` (~2.6k lines) — simple to deploy,
but a candidate for componentization as it grows.

## ADR-104 — MSAL.js with PKCE; tokens in **sessionStorage**; 15-min idle logout
**Context.** The SPA needs Entra sign-in and a short-lived API token.
**Decision.** `@azure/msal-browser` (bundled, exposed as `window.msal`), PKCE auth
code flow, `cacheLocation: 'sessionStorage'`, and a client-side 15-minute idle
logout.
**Alternatives considered.** (a) *`localStorage` cache* — survives tab close
(nicer UX) but widens XSS token-theft exposure and persists across sessions;
rejected. (b) *HttpOnly cookie + BFF* — strongest against token theft, but requires
a stateful backend-for-frontend and server-side session — too much for this
single-tenant tool. (c) *Implicit flow* — obsolete/insecure; rejected.
**Trade-offs.** `sessionStorage` means a token is reachable by script if an XSS bug
exists — accepted because the strict CSP (`script-src 'self'`, no `unsafe-eval`)
and bundled libraries make script injection hard, and tokens are short-lived with
an idle timeout. Closing the tab forces re-auth (acceptable for a compliance tool).

## ADR-105 — Build with **Vite 8** (rolldown); self-host React/MSAL
**Context.** The prototype loaded React/MSAL/Babel from a CDN and compiled JSX in
the browser — which required CSP `unsafe-eval` and broke without internet.
**Decision.** Build/bundle with Vite; precompile JSX; self-host all libraries.
Current version: **Vite 8** (rolldown engine), `@vitejs/plugin-react` 6.
**Alternatives considered.** (a) *Webpack / CRA* — heavier config, slower, CRA is
unmaintained. (b) *esbuild alone* — fast but less batteries-included for an app
build. (c) *Staying on Vite 5* — rejected after review: it carried a dev-server
esbuild advisory; Vite 8 clears it and `npm audit` is now clean including dev deps.
**Trade-offs.** Introduces a Node **build step** (multi-stage Docker build) and a
Node ≥20.19/22.12 requirement *for the build only*. We bumped the build stage and
CI to Node 22; the production image is unchanged (nginx serving static files), so
there is **no runtime footprint**. Net: faster load, works air-gapped, and the CSP
drops `unsafe-eval` and CDN origins.

## ADR-106 — nginx as the web tier (static + reverse proxy), not Node-serves-static
**Context.** Something must terminate TLS, serve the SPA, set security headers, and
route `/api`.
**Decision.** nginx serves the built SPA, terminates TLS, applies HSTS/CSP/frame
controls, and reverse-proxies `/api` to Node so the browser is **same-origin**.
**Alternatives considered.** (a) *Serve static from Express* — couples static
serving to the app process, makes Node responsible for TLS/headers it's not great
at, and loses nginx's efficient static/caching. (b) *Separate CDN + API origin* —
reintroduces CORS and a cross-origin token posture for no benefit on an internal
tool.
**Trade-offs.** One more container, and CSP/headers live in `nginx.conf` (plus
`helmet` as defense-in-depth) — two places to keep aligned. Worth it for the
same-origin model and clean separation.

## ADR-107 — Node.js + Express for the API
**Context.** Need a small, well-understood HTTP/JSON service that talks Postgres
and Microsoft Graph.
**Decision.** Node 22 + Express 5, plain CommonJS, thin layering (server →
routes → services).
**Alternatives considered.** (a) *Fastify* — faster and schema-first, but Express's
ubiquity and middleware ecosystem won for a team-maintained internal app. (b)
*NestJS* — too much structure/DI ceremony for this size. (c) *.NET / Go* — strong
options, but JS keeps one language across web and API and matches the MSAL/Graph
JS SDKs.
**Trade-offs.** Express gives little structure for free — hence the explicit
async-wrapper and the hand-rolled auth. The simplicity is the point; the
discipline is on us.
**Consequence.** The former ~1.2k-line `routes.js` has been split into per-domain
modules under `src/routes/` (mounted by `routes/index.js`), with shared authz
helpers in `src/authz.js` — verified behaviour-preserving by an identical route
inventory and the test suite (`docs/TESTING.md`).

## ADR-108 — PostgreSQL 16 as the only datastore
**Context.** The domain is inherently relational (people ↔ groups ↔ policies ↔
signatures) and reporting is set-based.
**Decision.** PostgreSQL 16; rich SQL (CTEs, `bool_or`, lateral joins, JSONB for
flexible bits like quiz answers and audit detail).
**Alternatives considered.** (a) *SQL Server* — natural in a Microsoft shop, but
Postgres is license-free, container-trivial, and the team's preference; the Azure
target (Azure DB for PostgreSQL) keeps parity. (b) *MongoDB/document* — rejected:
the compliance queries are joins and aggregates, the antithesis of document stores.
(c) *SQLite* — too limited for concurrent multi-container use.
**Trade-offs.** Operating a stateful DB (backups, restore, at-rest encryption) is
on us — addressed with scheduled `pg_dump` + a tested restore path. JSONB columns
trade schema strictness for flexibility in the few places it helps.

## ADR-109 — Enforce append-only via **database grants** (not triggers or app code)
**Context.** Ledger immutability is the system's core trust property (§7).
**Decision.** Tables owned by the superuser; the app's role gets insert/select and
has update/delete **revoked** on `signatures`, `audit_log`, `quiz_attempts`.
**Alternatives considered.** (a) *App-level discipline* — "just never write an
UPDATE" — rejected: one bug or injection defeats it. (b) *`BEFORE UPDATE/DELETE`
triggers that raise* — works, but is bypassable by the table owner and adds moving
parts; grants are simpler and absolute for the app role. (c) *Event sourcing / a
dedicated ledger DB* — over-engineered for the scale.
**Trade-offs.** Corrections must be new rows (intentional). Schema migrations that
touch these tables must run as the owner, not the app role — a deploy-time nuance
documented in the DB scripts.

## ADR-110 — One polymorphic `policies` table for admin policies **and** manager trainings
**Context.** Manager-uploaded trainings behave like admin policies (assign,
deadline, quiz, sign, report) but are file-backed rather than SharePoint-backed.
**Decision.** Reuse `policies` with `doc_type`, `source='Upload'`, `upload_*`
columns and `owner_oid`, instead of a parallel `trainings` table.
**Alternatives considered.** (a) *Separate `trainings` table* — would duplicate
every compliance/reminder/quiz/reporting query and code path, doubling maintenance
and risking divergence. (b) *Single-table-inheritance with a child table for upload
fields* — more normalized but adds a join to nearly every query for little gain at
this scale.
**Trade-offs.** A broader table with some nullable columns (SharePoint refs vs
upload refs). Mitigated by the explicit `source`/`doc_type` discriminators. The win
— one code path for all governance documents — is large and repeatedly paid back.

## ADR-111 — Uploads via `multer` to a disk **volume**, server-determined content type
**Context.** Managers upload PDFs/video/Office files for trainings.
**Decision.** `multer` (now **2.x**) disk storage to the `/uploads` volume;
random UUID filenames; an **extension allowlist**; and files are served with a
**server-derived** `Content-Type` + `nosniff` — never the client-supplied MIME.
**Alternatives considered.** (a) *Memory storage* — risky for 250 MB files
(memory pressure). (b) *Object storage (S3/Azure Blob) now* — the cleaner target,
but adds a dependency the on-prem VM model doesn't need yet; the volume is the
pragmatic local choice and the abstraction is small to swap later. (c) *Trusting the
client MIME* — rejected outright: it's the classic stored-XSS / content-sniffing
hole.
**Trade-offs.** Local disk doesn't replicate or scale horizontally (same
single-instance constraint as the schedulers). multer 1.x→2.x was a deliberate bump
off a deprecated/vulnerable line; the `.single()` API was unchanged.

**Update (HA step 1).** The "abstraction is small to swap later" promise above is
now realized: `apps/api/src/storage.js` is a pluggable backend behind a tiny
interface — `finalize(file) → key`, `exists(key)`, `openReadStream(key)`,
`remove(key)`. multer still stages the upload to `UPLOAD_DIR` first (never memory);
`finalize()` then persists it to the configured driver. `STORAGE_DRIVER=local`
(default) is byte-for-byte the previous behaviour, so the single-host deployment is
unchanged. `STORAGE_DRIVER=blob` uploads to **Azure Blob** (Managed Identity via
`DefaultAzureCredential`, or a connection string for dev) so **any API replica can
serve any file** — removing the disk-volume blocker to running more than one API
instance. `@azure/storage-blob` is lazy-`require`d, so it is only a dependency when
the blob driver is actually selected. The upload → serve → replace path is covered
by `test/integration/uploads.test.js` (regression net added before the refactor).

## ADR-112 — Microsoft Graph for directory; **SCIM-first**, AU-scoped Graph fallback; `Sites.Selected`
**Context.** The app needs to know which users/groups exist and to read policy
documents — without over-reading the tenant.
**Decision.** SharePoint via Graph **`Sites.Selected`** (read on exactly one site).
Directory sync prefers **SCIM** (Entra *pushes* only app-assigned users → zero
Graph directory permissions), with **AU-scoped Graph** as a fallback that reads
only app-assigned principals. Graph runs **app-only**, via Managed Identity in prod
(`apps/api/src/graph.js`):

```js
const credential =
  cfg.clientSecret && cfg.graphClientId
    ? new ClientSecretCredential(cfg.tenantId, cfg.graphClientId, cfg.clientSecret) // dev
    : new DefaultAzureCredential();                                                 // prod: Managed Identity
```

**Alternatives considered.** (a) *Tenant-wide `User.Read.All` + `Sites.Read.All`* —
simplest, but standing permission to read the entire directory and every site;
rejected on least-privilege grounds. (b) *Nightly CSV/HR-feed import* — avoids Graph
but loses real-time-ish accuracy and adds a brittle file pipeline.
**Trade-offs.** Least privilege costs setup: a per-site permission grant, and SCIM
needs enterprise-app provisioning config. `Mail.Send` (ADR-113) is the one broad
grant — constrained operationally with an Exchange Application Access Policy.

## ADR-113 — Email via Graph `sendMail` (no SMTP infrastructure)
**Context.** Reminders and acknowledgement confirmations need outbound email.
**Decision.** Send from a designated mailbox via Graph `Mail.Send`. A daily engine
sends assignment/20/15/7/1-day/overdue reminders plus owner review reminders;
confirmations are fire-and-forget on sign. Idempotent via `notifications_sent`.
**Alternatives considered.** (a) *Run/relay SMTP* — infra to operate and secure;
rejected. (b) *SendGrid/Mailgun* — another vendor and key, and email would come from
a non-corporate domain; rejected since the identity already exists in M365.
**Trade-offs.** `Mail.Send` (application) is broad — restrict it to the one mailbox
with an Exchange Application Access Policy. Email bodies interpolate names/policy
titles, so all interpolation is HTML-escaped (finding M-2) to prevent injection.

## ADR-114 — In-process schedulers (`setInterval`), not an external scheduler/queue
**Context.** Need a daily backup and a daily sync+reminder pass.
**Decision.** Run both as in-process timers in the API (§9).
**Alternatives considered.** (a) *A separate cron container* — cleaner separation,
but another moving part and another image. (b) *A job queue (BullMQ/Redis)* —
overkill for two daily jobs. (c) *Platform scheduler (cron job / Azure
Functions/Timer)* — the right answer **when** moving to Azure or scaling out.
**Trade-offs (explicit and important).** Timers reset on restart.

**Update (HA step 2).** The original "not multi-replica safe" trade-off is
resolved: each tick runs under `withLeaderLock` (`src/leader.js`), which grabs a
Postgres **advisory lock** so only one replica runs the job while the others skip
(see §9). The lock is held for the whole job and releases with the DB session, so a
crashed leader is automatically taken over on the next tick. `SCHEDULERS_ENABLED`
stays `true` on every replica; it is now purely a kill-switch. A platform
scheduler / queue remains the right answer for very large fleets, but the app tier
is no longer *blocked* from horizontal scaling by these jobs.

## ADR-115 — Structured logging with `pino`; optional push/pull integration
**Context.** Need SIEM-friendly logs and a way to feed audit events to external
systems.
**Decision.** `pino` JSON logs to stdout with secret redaction and a per-request
correlation id; an admin-configurable **push** (forward each audit event to a
webhook) and **pull** (`/feed/audit`, API-key authenticated) integration.
**Alternatives considered.** (a) *Winston* — fine, but pino is faster and
lower-overhead. (b) *A logging agent/sidecar only* — still want structured app logs
regardless.
**Trade-offs.** The admin-set forward URL is an authenticated SSRF surface —
constrained by `isSafeHttpUrl` (reject loopback/link-local/non-http(s)) at save and
send time (finding M-4). The pull feed sits outside `/api`, so it gets its own
rate limiter and logs failed auth (finding M-3).

## ADR-116 — Inject SPA runtime config from env at container start
**Context.** A static SPA still needs per-environment config (tenant, client ids).
**Decision.** Generate `config.js` from env on container start (§10); the built
image is environment-agnostic.
**Alternatives considered.** *Bake config at build time* — would require a separate
build per environment and risk shipping the wrong tenant's ids; rejected for
violating build-once-deploy-many.
**Trade-offs.** A tiny startup script and a global `window.APP_CONFIG`. The values
are public (client/tenant ids are not secrets), so exposing them in a served file
is fine.

## ADR-117 — Package & run with Docker Compose on a Windows VM (Azure-native as target)
**Context.** Must run on existing on-prem VMware Windows infrastructure today.
**Decision.** Three containers (`web`/`api`/`db`) via Docker Desktop/WSL2; secrets
in `.env`; TLS certs mounted from disk; DB published on loopback only.
**Alternatives considered.** (a) *Kubernetes* — far too much operational weight for
three containers and one instance. (b) *Azure-native now* — the intended target
(App Service/Container Apps + Managed Identity + Key Vault + Azure DB for PostgreSQL
+ Private Endpoint + WAF), and the code already supports it via
`DefaultAzureCredential`; deferred to fit current infra/skills.
**Trade-offs (the known weak points).** Secrets on disk and host-level DB access are
the residual risks (documented in `SECURITY-REVIEW.md`); the Azure path removes both.
Single host = single point of failure, mitigated by backups + restart policy.

## ADR-118 — Standardize the runtime on Node 22 LTS
**Context.** Node 18 reached end of life; Vite 8 also requires Node ≥20.19/22.12.
**Decision.** Both the API runtime image and the web build stage (and CI) run
**Node 22** (current LTS). `postgresql16-client` remains available on the newer
Alpine base, so `pg_dump` still matches the `postgres:16` server.
**Alternatives considered.** (a) *Stay on Node 18* — EOL, no security patches;
rejected. (b) *Node 20* — supported, but 22 is the current LTS with a longer
support horizon.
**Trade-offs.** Requires validating native/transitive deps on 22 (done: API
modules load and unit tests pass on 22). Pre-prod status made this a safe time to
move.

## ADR-119 — Rate limiting with a pluggable store (in-memory default, shared Redis for HA)
**Context.** `express-rate-limit` guards `/api`, `/api/sync` and `/feed`. Its
default store counts requests in each process's memory — correct for one instance,
but with N replicas a client effectively gets N× the limit and counters reset per
instance, weakening the brute-force / abuse protection exactly when the system is
scaled out.
**Decision.** Keep the in-memory store as the default (zero behaviour change for the
single-host deployment) and make the store pluggable via `src/ratelimit.js`
(`makeStore(name)`). When `RATE_LIMIT_REDIS_URL` is set, each limiter gets a
Redis-backed store (a distinct key prefix per limiter, one shared connection), so
the window is shared across every replica. `rate-limit-redis` and `redis` are
**lazy-required** — they are only a dependency when the Redis URL is set, mirroring
the Blob storage driver (ADR-111).
**Alternatives considered.** (a) *Postgres-backed limiter* — reuses the DB we have,
but adds write load on the hot path and there's no first-class store; rejected.
(b) *Edge/gateway rate limiting only* (nginx / Front Door) — good defense-in-depth
and complementary, but doesn't protect app-specific limits like the `/api/sync`
cap; kept as a future addition, not a replacement. (c) *Sticky sessions* — masks
the problem, doesn't share state; rejected.
**Trade-offs.** Redis becomes a soft dependency when enabled; connection errors are
logged and the client reconnects, but a hard Redis outage degrades limiting. The
default path has no such dependency. Only the count store is shared — limits and
windows stay defined in code.

## ADR-120 — Policy approval workflow
**Status: Accepted — Phase 1 + Phase 2a (notifications + My approvals) + Phase 2b
(group approvers: all/any/quorum) + Phase 2c (reusable templates, apply-copies-in
for run isolation) + Phase 2d (directory-group approvers, snapshot-at-submit)
implemented** (see the "Shipped" note in
[`POLICY-APPROVAL-WORKFLOW.md`](POLICY-APPROVAL-WORKFLOW.md)). Group membership is
read from the already-synced `effective_group_membership` view, so no new Entra
scope was needed; members are frozen at submit so an in-flight run never shifts.
**Context.** The portal distributes and collects acknowledgements for policies that
are assumed already approved elsewhere; there is no pre-publication sign-off (draft →
review → approved) in the system.
**Decision.** Add a per-policy, **per-version** approval workflow: reusable, ordered
approval templates (approver by person or group; sequential; all/any/quorum), the
states Draft/In Review/Changes Requested/Approved/Published/Rejected, and an
**append-only** `policy_approvals` decision ledger (same integrity model as
`signatures`/`audit_log`, ADR-109). A **publish gate** keeps unapproved policies
private — reusing private-by-default — so a policy can't reach employees until
Approved+Published. Re-approval is tied to the version, dovetailing with the existing
"new version ⇒ re-sign" logic. The migration defaults **existing** policies to
`published` / `approved_externally` so current behaviour is unchanged.
**Alternatives considered.** (a) *Approve in SharePoint/Purview/a separate GRC tool* —
viable, but splits the record; building it in-portal makes the portal the single
system of record and reuses its identity/audit/notification machinery. (b) *No
templates, per-policy approvers only* — simpler, kept as the Phase-1 MVP shape; full
templates are Phase 2. (c) *Cryptographically signed approvals* — deferred; the
append-only ledger + token-bound identity matches the existing evidence model.
**Trade-offs.** A substantial feature (migration, state machine, endpoints, UI, RBAC,
notifications) touching the publish path and versioning — hence designed and phased
before implementation. Entirely Azure-independent.

---

## ADR-121 — Immutable content & quiz revisions
**Status: Accepted — implemented** (see
[`IMMUTABLE-REVISIONS-PROPOSAL.md`](IMMUTABLE-REVISIONS-PROPOSAL.md) for the full
design & decision record). Closes external-review findings #4 and #9.
**Context.** Acknowledgements and quiz passes are stored append-only (ADR-109),
but what they *pointed at* was mutable: a `signature` snapshotted only a free-text
version label while the content behind it (the SharePoint pointer, or the
replaceable upload) could change in place — and a `quiz_attempt` was graded
against a `quiz_questions` set that could be edited or deleted afterwards. So an
acknowledgement could resolve to different bytes (or none), and a past "pass" was
neither reproducible nor auditable.
**Decision.** Freeze content into **append-only, content-addressed revisions**
(sha256 of the exact bytes), frozen **locally** for both uploads and
SharePoint-hosted documents (Decision 2a — an acknowledgement survives
independently of the source system, air-gap/DR friendly). `signatures.revision_id`
binds each acknowledgement to its exact frozen revision (FK ⇒ the bytes can never
be removed while referenced); `policies.current_revision_id` caches the live
revision so signing need not re-hash, and is cleared on any content change so the
next acknowledgement freezes fresh content. On a content change a **new revision +
new obligation** is created and old signatures stay valid as historical truth,
never carried forward (Decision A). Quiz attempts become **self-describing**
(`graded_against` + `definition_sha256`), so a later quiz edit can't change what a
past pass meant. Serve/verify endpoints let a governor re-hash frozen bytes
(tamper evidence) and let the original signer re-open exactly what they signed.
Append-only integrity is enforced at the DB level (revoke update/delete on
`policy_revisions`), same as the other ledgers.
**Alternatives considered.** (a) *Bind to a version label only* — the status quo
that #4 flags; insufficient. (b) *Trust the SharePoint etag instead of freezing
bytes* (Decision 2b) — cheaper, but not self-contained and not air-gap-verifiable;
rejected. (c) *"Minor edit" carry-forward of signatures* (Decision B) — rejected:
"material?" is a gameable human judgment in a compliance system. (d) *A separate
`quiz_revisions` table* — heavier than needed; a self-describing attempt closes #9
with one migration.
**Trade-offs.** Storage cost of one frozen copy per distinct content state
(bounded, and deduped by content hash) is accepted for genuine reproducibility.
Obligation/dashboard state is deliberately left version-based for now (a
documented boundary): a same-label in-place content swap on a non-workflow policy
preserves old bytes and freezes a new revision but does not itself raise a new
dashboard obligation — bump the version, which the workflow enforces. Entirely
Azure-independent.

---

# Part III — Cross-cutting trade-off themes

- **Single-instance simplicity vs. horizontal scale.** The system was originally
  simple and correct *today* at the cost of a documented refactor before scaling
  out. Those boundaries are now removed and the app tier is stateless-ready:
  uploads have a pluggable backend (ADR-111, `STORAGE_DRIVER=blob`) so any replica
  can serve any file; the in-process schedulers (ADR-114) elect a single leader per
  tick via a Postgres advisory lock (`src/leader.js`) so they are safe to run on
  every replica; and the rate limiters use a shared Redis store when
  `RATE_LIMIT_REDIS_URL` is set (ADR-119, `src/ratelimit.js`) so the window isn't
  multiplied by the replica count. Each is opt-in and defaults to the previous
  single-host behaviour. What remains for full HA is infrastructure, not app code:
  an HA Postgres, an HA edge/proxy, and running ≥2 API replicas behind it.
- **Least privilege vs. setup cost.** Entra app-only with `Sites.Selected`, SCIM,
  AU-scoping and a non-owner DB role (ADR-101/109/112) each trade one-time
  configuration effort for a permanently smaller blast radius. The project
  consistently chooses the smaller blast radius.
- **Explicitness vs. brevity.** Hand-rolled token validation (ADR-102) and the
  append-only-by-grant model (ADR-109) favour code you can read and audit over
  framework magic — appropriate when the thing being protected is compliance
  evidence.
- **DRY vs. drift in SQL.** The effective-membership union (§5) was duplicated
  across ~11 queries and had already bitten once (M-1); it is now consolidated into
  the single `effective_group_membership` view, removing that class of drift. The
  former `routes.js` monolith has since been split into per-domain modules under
  `src/routes/` with shared helpers in `src/authz.js`.
- **On-prem now vs. Azure-native later.** Every on-prem weak point (secrets on
  disk, host DB access) has a documented Azure-native answer the code already
  supports — the migration is a hosting change, not a rewrite.

# Part IV — Current stack baseline

| Layer | Technology | Version note |
|------|-----------|--------------|
| Frontend | React + `@azure/msal-browser` | React 19, msal-browser 5, classic JSX |
| Build | Vite (rolldown) + `@vitejs/plugin-react` | **Vite 8**, plugin-react 6 |
| Web tier | nginx (alpine) | TLS, CSP/headers, `/api` proxy |
| API runtime | Node.js + Express 5 | **Node 22 LTS**, CommonJS |
| Token validation | `jsonwebtoken` + `jwks-rsa` | RS256, JWKS-cached |
| Integration | `@microsoft/microsoft-graph-client` + `@azure/identity` | Managed Identity in prod |
| Uploads | `multer` | **2.x** |
| Logging | `pino` + `pino-http` | **pino 10 / pino-http 11**, JSON, redacted, correlation id |
| Data | PostgreSQL | **16**, append-only ledgers |
| Orchestration | Docker Compose | Windows VM / WSL2 (Azure-native target) |

_This document reflects the codebase as of the `claude/code-review-best-practices`
branch, including the Node 22 / Vite 8 / multer 2 upgrades, the routine major
dependency-currency bumps (React 19, Express 5, `@azure/msal-browser` 5, helmet 8,
express-rate-limit 8, pino 10 / pino-http 11 — each verified compatible), and the
M-1…M-4 hardening recorded in [`CODE-REVIEW-2026-06.md`](CODE-REVIEW-2026-06.md)._
