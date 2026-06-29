# Birgma Governance Portal — Testing Plan

How this system is tested: the levels, what each one covers and deliberately
does not, the tools, how to run them locally and in CI, and the conventions for
adding new tests. The plan is shaped by the app's risk profile — it is a
**compliance system of record**, so the highest-value tests target authorization,
the append-only ledgers, and the "required vs signed" logic.

---

## 1. Test levels (the pyramid for this app)

```
        ┌─────────────────────────────┐
        │  E2E / smoke (manual + /verify)   few, broad
        ├─────────────────────────────┤
        │  Integration — API (supertest)    medium: routes + RBAC + SQL
        │  Integration — DB (real Postgres) medium: views, ledgers, migrations
        ├─────────────────────────────┤
        │  Unit (node:test)                 many, fast, pure logic
        └─────────────────────────────┘
```

| Level | Scope | Needs a DB? | Where |
|-------|-------|-------------|-------|
| **Unit** | Pure functions / decision logic in isolation | No | `apps/api/test/unit/**` |
| **Integration — DB** | Schema + every migration + grants applied to a real Postgres; views, append-only enforcement | **Yes** | `apps/api/test/integration/db.test.js` |
| **Integration — API** | The real Express app via HTTP (supertest), exercising middleware, RBAC and SQL end-to-end against a real DB | **Yes** | `apps/api/test/integration/api.test.js` |
| **Regression** | The API suite doubles as the regression net: it locks observable behaviour so refactors (e.g. the `routes.js` split) provably change nothing | Yes | same as API |
| **Contract** | Response-shape assertions on key endpoints (a subset of the API tests) | Yes | within API tests |
| **Security** | Token hardening (tenant/scope/app-only), authz default-deny, append-only, SSRF guard, HTML-escaping | Partly | unit (`auth`, `util`) + API (RBAC/`canRead`) + DB (ledgers) |
| **E2E / smoke** | The running stack in a browser/container | n/a | manual via `/verify`, `/run`; future Playwright |

### Test framework
- **Runner:** Node's built-in `node:test` (zero extra runtime deps).
- **HTTP:** `supertest` (dev dependency) drives the real Express app in-process.
- **Assertions:** `node:assert/strict`.

---

## 2. What each level covers here

### Unit (`test/unit/`)
Pure, dependency-free logic — fast and runnable anywhere (no DB, no network):
- `util.test.js` — `escapeHtml` (email injection defence), `isSafeHttpUrl`
  (SSRF guard), `pgEnvFrom` (no creds in argv), `milestoneFor` (reminder ladder).
- `auth.test.js` — `principalFromClaims`: the token-hardening rules
  (foreign-tenant reject, app-only reject, missing-scope reject, principal
  projection) without needing JWT/JWKS.

### Integration — DB (`test/integration/db.test.js`)
Runs the **real** `schema.sql` + every migration + `docker-grants.sql` against a
throwaway Postgres, then asserts the invariants the app trusts the database to
enforce:
- `effective_group_membership` reproduces *direct ∪ mapped* membership and
  excludes archived groups (the consolidation behind finding M-1).
- The append-only ledgers (`signatures`, `audit_log`, `quiz_attempts`)
  physically reject `UPDATE`/`DELETE` for the least-privilege app role.

This level also implicitly validates that **all migrations apply cleanly in
order** — a fast guard against a broken migration.

### Integration — API (`test/integration/api.test.js`)
Drives the real app over HTTP with a real DB. Auth is stubbed so a test can act
as a principal, but the **real** `requireAdmin`/`requireManager` guards and all
SQL run unchanged. Covers:
- `/healthz` open; `/api/me` requires auth.
- RBAC: admin-only endpoints 403 for non-admins, 200 for admins.
- Policy visibility: members see assigned policies, non-members do not
  (private-by-default).
- `canRead`: document endpoint 403 for non-members, 200 for members.
- Sign flow: acknowledge → status becomes `signed`.
- Quiz gate: cannot sign until the knowledge check is passed.
- **Quiz attempt cap is race-safe** under concurrent submissions (regression for
  the advisory-lock fix, finding L-2).
- Dashboard `required` vs `signed` at the current version.

### Deliberately out of scope (for now)
- Microsoft Graph / SharePoint / `sendMail` calls — not exercised against live
  Graph; tests use link-only policies (no drive/item) and an unset mail sender so
  no network is required. Graph clients would be mocked if deeper coverage is
  added.
- Browser/SPA E2E — covered manually via the `/verify` and `/run` skills; a
  Playwright smoke suite is a future addition.

---

## 3. Running the tests

### Locally — unit only (no DB, instant)
```bash
cd apps/api
npm test
```

### Locally — integration (needs Postgres)
Point the harness at any Postgres; it applies the schema itself and **skips
cleanly if no DB is reachable**.

```bash
# Option A: reuse the project's compose db
cd deploy && docker compose up -d db

# Option B: any local Postgres 16. Then:
cd apps/api
export TEST_SUPER_DATABASE_URL='postgres://postgres:postgres@localhost:5432/governance'
export DATABASE_URL='postgres://governance_app:apppw@localhost:5432/governance'
npm run test:integration      # or: npm run test:all  (unit + integration)
```

- `TEST_SUPER_DATABASE_URL` — a superuser connection used to (re)create the
  schema, the `governance_app` role, and to truncate/seed between tests.
- `DATABASE_URL` — the least-privilege app-role connection the app itself uses.
- Integration files run **serialized** (`--test-concurrency=1`) because they
  share one database (reset per file, truncate per test).

### Test data lifecycle
`test/helpers/db.js` drops & recreates the schema once per file (`applyAll`),
truncates between tests (`truncate`), and offers seed helpers
(`seedEmployee`, `seedGroup`, `addMember`, `mapGroup`, `seedPolicy`, `seedQuiz`).
Seeding runs as superuser (so it can populate append-only tables for setup);
assertions about immutability run as the app role.

---

## 4. CI

The GitHub Actions `api` job runs unit + integration tests against a
`postgres:16` service container (see `.github/workflows/ci.yml`):
- Unit tests always run.
- Integration tests run with `DATABASE_URL` / `TEST_SUPER_DATABASE_URL` pointed
  at the service; the harness creates the role + schema.
- The job also runs `npm audit --omit=dev --audit-level=high`.

The `web` job builds the SPA and audits its production deps.

---

## 5. Conventions for new tests

- **Prefer the lowest level that can catch the bug.** Pure logic → unit;
  anything touching SQL/authz → integration.
- **Extract pure functions** from route handlers when logic gets non-trivial
  (e.g. `principalFromClaims`, `gradeQuiz`) and unit-test them directly.
- **Every new endpoint** gets at least: one happy-path API test, one
  authorization-denied test, and (if it writes) one persistence assertion.
- **Regressions:** when fixing a bug, add the failing test first (e.g. the
  quiz-cap race test mirrors finding L-2).
- Keep integration tests **hermetic**: seed everything they need, assert, and
  rely on per-test truncation — never depend on another test's data or ordering.

---

## 6. Coverage focus (risk-weighted)

Highest priority, because this is compliance evidence:
1. **Authorization** — `principalFromClaims`, `requireAdmin/Manager`, `canRead`,
   private-by-default. _(unit + API)_
2. **Ledger integrity** — append-only enforced at the DB grant layer. _(DB)_
3. **Compliance correctness** — effective membership + required-vs-signed. _(DB + API)_
4. **Concurrency invariants** — quiz attempt cap. _(API)_

These four are the regression net that makes structural refactors (such as the
`routes.js` per-domain split) safe to perform.
