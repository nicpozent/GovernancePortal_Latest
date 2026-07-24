# Low-Level Design (LLD) — Birgma Governance Portal

_Application-wide implementation reference: endpoint contracts, key algorithms,
data structures, error handling and security at code granularity. Complements the
[`HLD.md`](HLD.md) (design view) and [`ARCHITECTURE-AND-DECISIONS.md`](ARCHITECTURE-AND-DECISIONS.md)
(rationale). The policy approval workflow has its own detailed LLD in
[`approval-workflow/LLD.md`](approval-workflow/LLD.md); this document references it
rather than duplicating it. Full per-column DDL is in the ERD
[`data-model.mmd`](data-model.mmd); the operator-facing error-code catalogue is in
[`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)._

---

## 1. Conventions (apply to every `/api` route)

- **Mount & auth (`routes/index.js`).** All domain routes hang off one router that
  first applies `requireAuth` (Entra token validation, §2) — so **every `/api/*`
  endpoint requires a valid delegated token**. `/healthz`, `/readyz`, `/metrics` and
  `/feed/audit` live on `app.js` outside this router.
- **Async errors.** The router wraps every handler so a rejected promise is forwarded
  to the JSON error middleware — handlers can be `async` and simply `throw`.
- **Path-param validation.** `:id`, `:oid`, `:adId`, `:pgId` are validated against a
  UUID regex via `router.param`; a bad value returns `400 {error:'bad_id'}` before the
  handler runs.
- **Error envelope.** The terminal handler returns `{error:'server_error', requestId}`
  with the request id for traceability; never a stack trace. Rate-limited responses are
  `{error:'rate_limited', detail}`. Domain errors use specific codes (e.g. `bad_id`,
  `feed_disabled`, `unauthorized`) — catalogued in `TROUBLESHOOTING.md`.
- **Authorization.** Enforced in-handler via the PDP helpers in §3 — never trusted from
  the client. Default deny.

## 2. Authentication — `auth.js`

`requireAuth` validates the `Authorization: Bearer` access token on every request:

- **Signature:** RS256 only, key resolved from the tenant **JWKS** endpoint and **cached**
  with a TTL (constant per-request cost — NFR-PRF-01).
- **Claims:** `iss` (tenant issuer), `aud` (API app id URI), `tid` (pinned tenant),
  and the required delegated **scope** (`access_as_user`) are all checked.
- **Delegated-only:** tokens without a user (app-only, `idtyp`/no `scp`) are **rejected**
  (FR-IAM-03).
- On success attaches `req.user` = `{ oid, name, roles, scopes, … }`; on failure returns
  `401` (`missing_token` / `invalid_token`).

## 3. Authorization (PDP) — `authz.js`

Exports the decision helpers used across handlers (recomputed per request):

| Helper | Decision |
|--------|----------|
| `isAdmin(req)` / `isManager(req)` | app-role checks from `req.user.roles` |
| `canRead(req, policy)` | `true` for admin, owner, or a configured approver; otherwise requires `approved_externally OR approval_state='published'` **and** the caller is in the policy's effective membership (publish gate + targeting) |
| `canManage(req, entity)` | manager owns the entity (`owner_oid`) **and** it is in their scope |
| `teamOids(req)` | the manager's team = functional-manager reports **∪** directory-manager-email matches |
| `audit(req, action, target, detail)` | append an `audit_log` row (best-effort, never blocks) |

`canGovern` (owner/admin gate for the approval flow) is defined in `routes/approvals.js`,
not here — see the approval LLD.

**Effective membership** (the attribute layer) is computed by a single SQL view,
`effective_group_membership` (migration 018) = direct `employee_groups` **∪** members of
directory groups mapped into a platform group (`group_mappings`). Every consumer selects
from this one view (fixes prior duplicate-query drift — NFR-PRF-02).

## 4. Endpoint reference by module

Roles: **A**=Admin, **M**=Manager, **E**=any authenticated employee, **Own**=ownership/
team-scoped, **Apr**=current-step approver. All are additionally gated by `requireAuth`.

### 4.1 `me` — identity projection
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/me` | E | Returns the caller's identity, `isAdmin`/`isManager`, and profile (from the synced `employees` row if present) — drives the SPA role/view selection. |

### 4.2 `policies` — lifecycle & document access
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/policies` | E | Assigned + visible policies (effective membership + publish gate baked into the query). |
| POST `/policies` | A | Create; body incl. `name, docType, version, sharepointUrl, sharepointDriveId, sharepointItemId, dueDate|dueDays, reviewDate, ownerOid, groupIds`. `owner_oid` FK-guarded (nulled if not a synced employee). |
| PUT `/policies/:id` | A | Edit/version; publishing a new `version` requires affected employees to re-acknowledge; writes a `policy_versions` row. |
| DELETE `/policies/:id` | A | Archive (soft-delete, `archived_at`); ledger preserved. |
| POST `/policies/:id/restore` | A | Un-archive. |
| GET `/policies-archived` | A | List archived. |
| GET `/policies/:id/versions` | A/Own | Version history. |
| GET `/policies/:id/document` | canRead | Metadata + `webUrl` + short-lived download URL (SharePoint). |
| GET `/policies/:id/content` | canRead | **Streams** the document for inline preview; Office types converted to PDF (`?format=pdf`); content-type server-set. |

### 4.3 `signatures` — acknowledgement ledger
| Method · Path | Role | Purpose |
|---|---|---|
| POST `/signatures` | E (canRead) | Record acknowledgement `{policyId, fullName, acknowledged}`; **quiz-gated** if a quiz exists and hasn't been passed; identity/version/timestamp taken server-side; append-only. |
| GET `/signatures` | E | The caller's own outstanding + completed acknowledgements. |

### 4.4 `quizzes` — knowledge checks (server-graded)
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/policies/:id/quiz` | E (canRead) | Serve the quiz **without** correct answers. |
| POST `/policies/:id/quiz` | A | Author/update (questions, options, `correct_index`, `pass_pct`). |
| POST `/policies/:id/quiz/attempt` | E | Grade **server-side** (answers never trusted from client); advisory-locked transaction; append-only `quiz_attempts`; returns pass/fail + pct. |
| POST `…/quiz/archive` · `…/restore` · DELETE `…/quiz` | A | Lifecycle. |
| GET `/policies/:id/quiz/analytics` | A | Attempt analytics. |

### 4.5 `trainings` — manager uploads
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/trainings`, `/trainings/groups` | M | Manager's trainings + targetable groups. |
| POST `/trainings`, PUT `/trainings/:id` | M/Own | Multipart upload via `multer` → `storage.js`; extension allowlist; server-determined content-type; replaces prior file on update. |
| DELETE `/trainings/:id` | M/Own | Archive. |
| GET `/policies/:id/file` | canRead | Serve an uploaded file (member-gated; `nosniff`). |
| GET `/groups/reach` | M/A | Member count for a selection. |

### 4.6 `employees` — directory master
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/employees`, `/employees/former` | A | Active / deactivated master. |
| POST `/employees`, `/employees/bulk` | A | Add one / CSV bulk import. |
| PUT `/employees/:oid/manager` | A | Set functional manager. |

### 4.7 `groups` — targeting
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/groups`, `/groups-archived`, `/platform-groups`, `/directory-groups` | A | List (by kind/source). |
| POST `/groups`, `/platform-groups` | A | Create local / platform group. |
| GET `/groups/:id/members`, POST/DELETE `…/members[/:oid]` | A | Membership. |
| POST `/group-mappings`, DELETE `/group-mappings/:adId/:pgId` | A | Map/unmap a directory group into a platform group (feeds effective membership). |
| POST `/groups/:id/archive` · `/restore`, DELETE `/groups/:id` | A | Lifecycle. |

### 4.8 `manager` — delegated views
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/manager/dashboard` | M | Team compliance, scoped by `teamOids`. |
| POST `/manager/reminders/run` | M | Nudge the team (config-gated, idempotent). |

### 4.9 `dashboards` — assurance reporting
| Method · Path | Role | Purpose |
|---|---|---|
| GET `/dashboard`, `/dashboard/by-department`, `/dashboard/by-group`, `/dashboard/group/:id` | A | Compliance aggregates with drill-down. Set-based SQL: obligations × effective members × current-version signatures. |
| GET `/reports/compliance` | A | CSV export, scopable. |

### 4.10 `admin` — operations, integrations, GDPR
| Method · Path | Role | Purpose |
|---|---|---|
| POST `/sync`, GET `/sync/status` | A | Trigger directory sync / read `sync_runs` history. `/sync` rate-limited (15/5min) → friendly `rate_limited`. |
| GET `/admin/backup`, GET/POST `/admin/backups`, GET `/admin/backups/:name` | A | On-demand + list + download `pg_dump` backups; DB creds via PG* env, never argv. |
| GET `/integrations`, PUT `/integrations`, POST `/integrations/feed-key`, POST `/integrations/test` | A | Feed/forward config (secrets returned only as "set?" booleans); rotate feed key; test forward. |
| GET `/audit` | A | Browse the audit ledger. |
| GET `/admin/data-subject/:oid/export` | A | **DSAR** — full per-subject package (audited). |
| GET `/sharepoint/browse` | A | Browse the connected SharePoint site to pick a document when creating a policy. |
| POST `/reminders/run` | A | Run the reminder ladder on demand. |

### 4.11 `approvals` & `approval-templates` — pre-publication sign-off
Endpoints: `PUT /policies/:id/approvers`, `POST /policies/:id/{submit,approve,reject,
request-changes,withdraw,publish,approve-externally}`, `GET /policies/:id/approvals`,
`GET /approvals/pending`; and `GET/POST/PUT/DELETE /approval-workflows[/:wfId]`,
`POST /policies/:id/apply-workflow`. **Contracts, the all/any/quorum satisfaction
algorithm, group expansion/snapshot-at-submit, and the state machine are specified in
[`approval-workflow/LLD.md`](approval-workflow/LLD.md).**

## 5. Data model

24 tables + 4 views in one PostgreSQL database; every table (columns, PK/FK/UK,
relationships) is drawn in [`data-model.mmd`](data-model.mmd). Domain grouping
(reference · obligation · ledger · operational) is in `ARCHITECTURE-AND-DECISIONS.md` §6.

**Append-only ledgers** — `signatures`, `quiz_attempts`, `policy_approvals`,
`audit_log` — have `UPDATE`/`DELETE` **revoked from the app role** in
`db/docker-grants.sql`; immutability is a database privilege, not application code
(ADR-109). Schema + ordered migrations 002–022 run via `db/migrate.js` (tracked,
transactional, idempotent) and as Docker init scripts on a fresh volume.

## 6. Key algorithms

- **Effective membership** (`effective_group_membership`, migration 018): `SELECT` union
  of direct `employee_groups` and members of directory groups mapped via `group_mappings`;
  the single predicate used by targeting, dashboards and `canRead`.
- **Publish gate** (`canRead`): a policy is invisible to employees unless
  `approved_externally OR approval_state='published'`; admin/owner/approver bypass for
  review. The same predicate is inlined into the employee `GET /policies` query.
- **Quiz grading** (`/quiz/attempt`): correct answers never leave the server; score
  computed from stored `correct_index`; attempt written under an advisory lock to serialise
  concurrent submissions; `passed = pct >= pass_pct`.
- **Reminder ladder** (`services/reminders.js`): milestones assigned → due-20/15/7/1 →
  overdue; idempotent per `(policy,user,version,milestone)` via the `notifications_sent`
  unique key; only group-assigned obligations notified.
- **Directory sync** (`services/sync.js`): reads only app-assigned principals (AU-scoped
  Graph or SCIM push); joiners/movers upsert, **leavers deactivated (never deleted)**;
  every run recorded in `sync_runs`.
- **DSAR / erasure** (`gdpr.js`): export assembles the full per-subject package; erasure
  **pseudonymises/redacts** rather than deleting ledger rows, preserving evidence integrity;
  retention purge drops data past a configurable window.
- **SSRF guard** (outbound forward/test): target URLs validated to block loopback/
  link-local before a webhook fires (NFR-SEC-09).

## 7. Security specifics

- **Edge (nginx):** TLS 1.2/1.3; HSTS; `X-Frame-Options: DENY`; `nosniff`; a strict CSP
  (`script-src 'self'`, no inline; `frame-src 'self' blob:` for the PDF viewer;
  `connect-src` limited to self + login.microsoftonline.com + graph); `/api` proxied
  same-origin (single-origin CORS).
- **API:** helmet headers; per-route rate limits (`/api` 120/60s, `/api/sync` 15/5min,
  `/feed` 60/60s) with a pluggable store (memory → Redis for HA).
- **DB:** non-owner least-privilege app role; ledger mutation revoked; parameterised SQL
  throughout; `:5432` loopback-only.
- **Feed:** `/feed/audit` authenticates with an API key using a constant-time compare and
  its own rate limit; returns `404 feed_disabled` when off.

## 8. Testing hooks

Integration tests run against a **real Postgres** (`apps/api/test/integration/*`):
`api` (12), `approvals` (10), `approval-templates` (6), `approval-groups` (6),
`services` (6), `db` (4), `gdpr` (4), `leader` (4), `uploads` (4), `observability` (3);
web unit tests in `apps/web/test/*`. See [`TESTING.md`](TESTING.md) and the story→test
matrix in [`USER-STORIES.md`](USER-STORIES.md) and `approval-workflow/USER-STORIES.md §5`.
