# Security & Code Review — status

Tracks the external review findings and what's been addressed.

## Resolved
- **H1 — Postgres exposed on the host.** Now bound to `127.0.0.1:5432` only
  (loopback); not reachable from the VM network. `deploy/docker-compose.yml`.
- **H2 — XSS in the acknowledgement-receipt print.** All interpolated values are
  HTML-escaped; popup opened with `noopener` and `opener` nulled. `apps/web/app.jsx`.
- **M1 — App-only tokens treated as users.** `requireAuth` now requires a
  delegated token (`scp`=`access_as_user`) and rejects `idtyp=app`. SCIM keeps its
  own bearer. `apps/api/src/auth.js`.
- **M2 — Unrestricted upload + client MIME echoed inline.** Upload is extension-
  allowlisted (PDF/video/PPT/Word/image); files are served with a
  **server-determined** Content-Type + `nosniff` (never the client MIME), so HTML/
  SVG/scripts can't be stored or served. `apps/api/src/routes.js`.
- **M3 — No .gitignore.** Added at repo root (ignores `.env`, `certs/`, keys,
  `backups/`, `uploads/`, `node_modules/`, zips).
- **M4 — Full-backup zip bundled secrets.** `backup-all.ps1` excludes `.env` and
  `certs/`. The DB dump remains, so store backups encrypted + off-host.
- **M5 — Document reads not assignment-scoped.** Reads of a document, its file and
  its quiz now require effective group membership (or admin/owner). Unassigned
  documents are **private** (admin/owner only) — distribute company-wide via the
  **All Employees** group. `apps/api/src/routes.js`.

## Verified non-issues (from the review)
- SQL injection — all queries parameterized.
- Backup-download path traversal — mitigated (basename + regex).
- Secret logging / error-handler leakage — clean.
- Append-only ledgers — `signatures`, `audit_log`, `quiz_attempts` are DB-enforced
  insert-only (no UPDATE/DELETE grant to the app role).

## Open / deferred (see docs/NEXT-STEPS.md)
- **Vite build + self-hosted React/MSAL/Babel** — would let CSP drop `unsafe-eval`.
  Deferred as its own pass (changes the runtime/build model).
- **Finer-grained roles** — a Compliance role between Admin and Manager.
- **Azure-native hardening** — Managed Identity (no stored secret), Key Vault,
  Private Endpoint, Conditional Access.
