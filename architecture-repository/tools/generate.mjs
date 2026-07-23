// ============================================================
//  Architecture Repository generator
//  Emits one directory per ABB (Architecture Building Block), each containing
//  the technology-neutral ABB definition (ABB.md) and a nested sbb/ directory
//  with the concrete Solution Building Block (SBB.md) that realizes it in the
//  Birgma Governance Portal.
//
//  Run from the repo root:  node architecture-repository/tools/generate.mjs
//  Idempotent: regenerates the tree from the CATALOG below.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const DOMAINS = {
  business: 'Business Architecture',
  data: 'Data Architecture',
  application: 'Application Architecture',
  technology: 'Technology Architecture',
};

// Each ABB: neutral capability (function/interfaces/deps/standards/reuse) + the
// SBB that realizes it here (product/realization/location/maturity/alternatives).
const CATALOG = [
  // ── Business ─────────────────────────────────────────────
  { id: 'B1', domain: 'business', name: 'Policy Lifecycle Management', reuse: 'Reusable pattern',
    fn: 'Author, version, assign, review and retire governance documents through a controlled lifecycle.',
    provided: 'create/update/version/archive a governed document; resolve its current authoritative version',
    required: 'D2 Obligation Catalogue; B4 targeting; a document source of record',
    deps: ['D2', 'B4', 'A6'], standards: 'ISO 27001 A.5.1 (policies)',
    sbb: { product: 'policies + policy_versions tables; SharePoint as document source',
      realization: 'CRUD + archive endpoints; version label mirrored from SharePoint; soft-delete keeps the ledger intact.',
      location: 'apps/api/src/routes/policies.js, db/schema.sql, services/sharepoint.js', maturity: 'Production-grade',
      alternatives: 'Any DMS/CMS with versioning could source documents.' } },
  { id: 'B2', domain: 'business', name: 'Compliance Attestation', reuse: 'Enterprise-reusable',
    fn: 'Capture a binding "I have read and understood" act, bound to a verified identity and a document version.',
    provided: 'record an acknowledgement; report a person\'s attestation status',
    required: 'A1 verified identity; D3 attestation ledger; (optional) B3 gate',
    deps: ['A1', 'D3', 'B3'], standards: 'Non-repudiation; GDPR Art.5 integrity',
    sbb: { product: 'signatures ledger + sign flow',
      realization: 'Identity taken from the verified token (never the client); version-stamped; quiz gate enforced before signing.',
      location: 'apps/api/src/routes/signatures.js (POST /signatures)', maturity: 'Production-grade',
      alternatives: 'Any append-only store with identity binding.' } },
  { id: 'B3', domain: 'business', name: 'Competency Verification', reuse: 'Reusable pattern',
    fn: 'Gate an obligation on demonstrated understanding via a scored assessment.',
    provided: 'serve a quiz; grade an attempt server-side; expose pass/fail and attempts',
    required: 'D5 results store; B4 targeting for read access',
    deps: ['D5', 'A2'], standards: '—',
    sbb: { product: 'quizzes + quiz_questions + quiz_attempts',
      realization: 'Server-side grading (answers never trusted from client); capped attempts with an advisory-locked transaction.',
      location: 'apps/api/src/routes/quizzes.js', maturity: 'Production-grade' } },
  { id: 'B4', domain: 'business', name: 'Obligation Assignment & Targeting', reuse: 'Reusable pattern',
    fn: 'Express which population must fulfil which obligation, via groups and effective membership.',
    provided: 'assign a document to groups; resolve who an obligation applies to',
    required: 'D1 identity/groups; the effective-membership rollup',
    deps: ['D1', 'D2'], standards: 'RBAC/ABAC targeting',
    sbb: { product: 'groups + policy_groups + effective_group_membership view',
      realization: 'Effective membership = direct group membership ∪ directory groups mapped into a group; unassigned ⇒ private.',
      location: 'apps/api/db/migration_018_effective_membership.sql, apps/api/src/routes/groups.js, apps/api/src/authz.js', maturity: 'Production-grade (membership consolidated into one view)' } },
  { id: 'B5', domain: 'business', name: 'Delegated Management (Organisational Scope)', reuse: 'Reusable pattern',
    fn: 'Let managers act only on their own content and their own team.',
    provided: 'scope reads/writes to a manager\'s team and owned items',
    required: 'A2 PDP; D1 manager graph',
    deps: ['A2', 'D1'], standards: 'Least privilege (ISO A.8.2)',
    sbb: { product: 'requireManager + canManage + teamOids',
      realization: 'Team = functional-manager reports ∪ directory-manager-email match; ownership = policies.owner_oid.',
      location: 'apps/api/src/authz.js (teamOids, canManage), apps/api/src/routes/manager.js', maturity: 'Production-grade' } },
  { id: 'B6', domain: 'business', name: 'Notification & Escalation', reuse: 'Enterprise-reusable',
    fn: 'Drive people to fulfil obligations through scheduled, escalating reminders.',
    provided: 'send due/overdue reminders on a milestone ladder; review reminders to owners',
    required: 'A7 messaging; D6 idempotency state',
    deps: ['A7', 'D6', 'A10'], standards: '—',
    sbb: { product: 'reminder engine (assigned/20/15/7/1-day/overdue)',
      realization: 'Idempotent per (policy,user,version,milestone); only group-assigned obligations notified (M-1 fix).',
      location: 'apps/api/src/services/reminders.js', maturity: 'Production-grade' } },
  { id: 'B7', domain: 'business', name: 'Compliance Reporting & Assurance', reuse: 'Reusable pattern',
    fn: 'Prove compliance status to auditors and leadership across policy, unit and group.',
    provided: 'aggregate required-vs-signed; per-group/department breakdown; CSV export',
    required: 'D2 catalogue; D3 ledger; D1 identity',
    deps: ['D1', 'D2', 'D3'], standards: 'ISO A.5.36 (compliance review)',
    sbb: { product: 'dashboard + by-department/by-group + reports/compliance',
      realization: 'Set-based SQL joining obligations × effective members × current-version signatures.',
      location: 'apps/api/src/routes/dashboards.js (/dashboard*, /reports/compliance)', maturity: 'Production-grade' } },
  { id: 'B8', domain: 'business', name: 'Accountability / Non-repudiation', reuse: 'Enterprise-reusable',
    fn: 'Maintain a defensible record of who did what, when.',
    provided: 'append admin-action events; read the audit trail / forward it',
    required: 'D4 audit ledger; A1 identity',
    deps: ['D4', 'A1'], standards: 'ISO A.8.15 (logging)',
    sbb: { product: 'audit_log (append-only) + audit() helper',
      realization: 'Every admin mutation writes an immutable, identity+IP-stamped row; best-effort, never blocks the request.',
      location: 'apps/api/src/authz.js (audit()), db/migration_006_audit.sql', maturity: 'Production-grade' } },

  { id: 'B9', domain: 'business', name: 'Pre-publication Approval', reuse: 'Enterprise-reusable',
    fn: 'Route a governed document through an ordered, multi-party sign-off before it becomes visible to its audience.',
    provided: 'configure approval steps/approvers; submit/withdraw; approve/reject/request-changes; publish; pending queue',
    required: 'A2 PDP; D8 approval ledger; B1 lifecycle',
    deps: ['A2', 'D8', 'B1'], standards: 'Segregation of duties; ISO 27001 A.5.4',
    sbb: { product: 'policy_approval_steps/approvers/approver_groups + approval_workflows templates',
      realization: 'Ordered steps with all/any/quorum satisfaction; group approvers expanded and frozen at submit; publish gated on Approved; decisions append-only. Detailed as AW-1..AW-7 in the approval-workflow package.',
      location: 'apps/api/src/routes/approvals.js, apps/api/src/routes/approval-templates.js, db/migration_019..022', maturity: 'Production-grade',
      alternatives: 'External BPM/workflow engine (e.g. Camunda) or a SaaS approval service.' } },
  { id: 'B10', domain: 'business', name: 'Data-Subject Rights (GDPR)', reuse: 'Enterprise-reusable',
    fn: 'Operate data-subject access, erasure and retention duties without breaking append-only evidence.',
    provided: 'DSAR export; lawful erasure (pseudonymize/redact); retention purge',
    required: 'D1 identity; D3/D4 ledgers',
    deps: ['D1', 'D3', 'D4'], standards: 'GDPR Art.15/17/5; ISO 27001 A.5.34',
    sbb: { product: 'gdpr.js (DSAR / erasure / retention)',
      realization: 'Exports a full per-subject package; erasure pseudonymizes/redacts rather than deleting ledger rows; retention purge past a configurable window.',
      location: 'apps/api/src/gdpr.js, apps/api/db/gdpr.js (CLI), apps/api/src/routes/admin.js', maturity: 'Production-grade (DPO adoption pending)' } },
  { id: 'B11', domain: 'business', name: 'Controls-as-Code Assurance', reuse: 'Enterprise-reusable',
    fn: 'Express security/compliance controls as data and prove their coverage deterministically in CI.',
    provided: 'control catalogue; coverage/gap + Statement-of-Applicability report; CI validation gate',
    required: 'the repository + CI',
    deps: [], standards: 'ISO 27001; NIST CSF; GDPR; MITRE ATT&CK',
    sbb: { product: 'compliance/controls.json + report.mjs',
      realization: 'Machine-readable controls with framework/ATT&CK/risk/evidence refs; deterministic coverage report; CI fails on a stale or invalid catalogue.',
      location: 'compliance/controls.json, compliance/report.mjs, .github/workflows/security.yml', maturity: 'Production-grade' } },

  // ── Data ─────────────────────────────────────────────────
  { id: 'D1', domain: 'data', name: 'Identity & Organisation Master Data', reuse: 'Reusable pattern',
    fn: 'Hold person, group, membership and manager-graph data reconciled from the enterprise directory.',
    provided: 'query people/groups/membership; the effective-membership rollup',
    required: 'A5 directory sync; T6 directory platform',
    deps: ['A5'], standards: '—',
    sbb: { product: 'employees, groups, employee_groups, group_mappings, group_effective_members + effective_group_membership',
      realization: 'Polymorphic groups by kind/source; leavers deactivated not deleted.',
      location: 'apps/api/db/*.sql', maturity: 'Production-grade' } },
  { id: 'D2', domain: 'data', name: 'Obligation Catalogue', reuse: 'Reusable pattern',
    fn: 'Store governed items, their targeting and their version history.',
    provided: 'read/write documents, group assignments and version notes',
    required: 'T4 RDBMS', deps: ['T4'], standards: '—',
    sbb: { product: 'policies, policy_groups, policy_versions',
      realization: 'One polymorphic table for admin policies and manager uploads (doc_type/source discriminators).',
      location: 'apps/api/db/schema.sql, migration_016_trainings.sql', maturity: 'Production-grade' } },
  { id: 'D3', domain: 'data', name: 'Immutable Attestation Ledger', reuse: 'Enterprise-reusable',
    fn: 'Persist attestations as an append-only, identity- and version-bound record; corrections are new rows.',
    provided: 'append(attestation); read(query)', required: 'T4 with revocable mutation grants',
    deps: ['T4'], standards: 'WORM/non-repudiation; ISO A.8.15',
    sbb: { product: 'signatures table',
      realization: 'UPDATE/DELETE revoked from the app role at the grant layer — immutability enforced by privilege, not code.',
      location: 'apps/api/db/docker-grants.sql, schema.sql', maturity: 'Production-grade' } },
  { id: 'D4', domain: 'data', name: 'Immutable Audit Ledger', reuse: 'Enterprise-reusable',
    fn: 'Append-only event-of-record for administrative actions.',
    provided: 'append(event); read(query); forward', required: 'T4 with revocable mutation grants',
    deps: ['T4'], standards: 'ISO A.8.15',
    sbb: { product: 'audit_log table',
      realization: 'UPDATE/DELETE revoked from the app role; JSONB detail; indexed by time.',
      location: 'apps/api/db/migration_006_audit.sql, docker-grants.sql', maturity: 'Production-grade' } },
  { id: 'D5', domain: 'data', name: 'Assessment Results Store', reuse: 'Reusable pattern',
    fn: 'Record assessment attempts and scores immutably.',
    provided: 'append(attempt); read attempts/analytics', required: 'T4',
    deps: ['T4'], standards: '—',
    sbb: { product: 'quiz_attempts table',
      realization: 'Append-only (UPDATE/DELETE revoked); stores answers as JSONB for per-question analytics.',
      location: 'apps/api/db/migration_011_quizzes.sql', maturity: 'Production-grade' } },
  { id: 'D6', domain: 'data', name: 'Notification State Store', reuse: 'Reusable pattern',
    fn: 'Track which notifications were sent to guarantee once-only delivery per milestone.',
    provided: 'has-sent?(policy,user,version,milestone); record-sent', required: 'T4',
    deps: ['T4'], standards: '—',
    sbb: { product: 'notifications_sent table',
      realization: 'Unique key per (policy,user,version,milestone); insert-on-conflict-do-nothing makes reminders idempotent.',
      location: 'apps/api/db/migration_013_notifications.sql', maturity: 'Production-grade' } },
  { id: 'D7', domain: 'data', name: 'Integration & Operations State', reuse: 'Solution-specific',
    fn: 'Hold integration configuration and operational run history.',
    provided: 'read/write forward+feed config; sync run history', required: 'T4',
    deps: ['T4'], standards: '—',
    sbb: { product: 'integration_config (singleton), sync_runs',
      realization: 'Single-row config; secrets never returned in full (only "set?" booleans).',
      location: 'apps/api/db/migration_017_integrations.sql', maturity: 'Production-grade' } },

  { id: 'D8', domain: 'data', name: 'Immutable Approval Decision Ledger', reuse: 'Enterprise-reusable',
    fn: 'Persist approval decisions append-only, bound to the document version and the step decided.',
    provided: 'append(decision); read the decision history for a version',
    required: 'T4 with revocable mutation grants',
    deps: ['T4'], standards: 'Non-repudiation; ISO 27001 A.8.15',
    sbb: { product: 'policy_approvals table',
      realization: 'UPDATE/DELETE revoked from the app role; each row records version, step, approver, decision, comment and time.',
      location: 'apps/api/db/migration_019_approvals.sql, docker-grants.sql', maturity: 'Production-grade' } },

  // ── Application ──────────────────────────────────────────
  { id: 'A1', domain: 'application', name: 'Identity Federation / Token Validation', reuse: 'Enterprise-reusable',
    fn: 'Validate a federated access token (signature, issuer, audience, tenant, token-type, scope) and expose verified identity.',
    provided: 'authenticate(request) → Principal{subject,name,roles,scopes}', required: 'T1 IdP discovery/JWKS',
    deps: ['T1'], standards: 'OAuth 2.0, OIDC, JWT (RFC 7519), JWKS (RFC 7517)',
    sbb: { product: 'auth.js over jsonwebtoken + jwks-rsa',
      realization: 'RS256 pinned; tenant pinned; app-only tokens rejected; identity from claims only; JWKS cached.',
      location: 'apps/api/src/auth.js', maturity: 'Production-grade',
      alternatives: 'Entra/Okta/Auth0 as IdP; express-oauth2-jwt-bearer or a gateway as validator.' } },
  { id: 'A2', domain: 'application', name: 'Policy Decision Point (Authorization)', reuse: 'Enterprise-reusable',
    fn: 'Decide permit/deny from role + ownership + attribute (effective membership). Default deny.',
    provided: 'can(principal,action,resource)', required: 'A1 principal; D1/D2 data',
    deps: ['A1', 'D1', 'D2'], standards: 'RBAC (NIST), ABAC/XACML PEP-PDP separation',
    sbb: { product: 'requireAdmin/requireManager + canRead/canManage',
      realization: 'Recomputed every request; private-by-default; membership now resolved through one shared view (M-1 fix).',
      location: 'apps/api/src/auth.js, apps/api/src/authz.js (canRead/canManage)', maturity: 'Production-grade (consolidated; previously embedded/duplicated)' } },
  { id: 'A3', domain: 'application', name: 'Edge / API Gateway', reuse: 'Enterprise-reusable',
    fn: 'Terminate TLS, apply security headers/CSP, present a same-origin surface, and rate-limit.',
    provided: 'TLS, header/CSP enforcement, reverse proxy, throttling', required: 'T2 HTTP edge',
    deps: ['T2'], standards: 'OWASP secure headers; CSP Level 2',
    sbb: { product: 'nginx + helmet + express-rate-limit',
      realization: 'nginx serves SPA + proxies /api same-origin; CSP without unsafe-eval; per-route limiters incl. /feed.',
      location: 'apps/web/nginx.conf, apps/api/src/app.js (helmet/rate-limit), apps/api/src/ratelimit.js', maturity: 'Production-grade' } },
  { id: 'A4', domain: 'application', name: 'Presentation / Experience', reuse: 'Reusable pattern',
    fn: 'Authenticated single-page client for the governance workflows.',
    provided: 'sign-in, browse, sign, quiz, admin/manager screens', required: 'A1/T1 for sign-in; the API',
    deps: ['T1', 'A3'], standards: 'OIDC PKCE',
    sbb: { product: 'React 19 + MSAL.js (Vite 8 build)',
      realization: 'PKCE; sessionStorage token cache; 15-min idle logout; runtime config injected at container start.',
      location: 'apps/web/src/*, 40-envconfig.sh', maturity: 'Production-grade' } },
  { id: 'A5', domain: 'application', name: 'Directory Synchronisation', reuse: 'Enterprise-reusable',
    fn: 'Reconcile in-scope external identities/groups into the local master, least-privilege; handle joiners/movers/leavers.',
    provided: 'sync() → {added,updated,deactivated}; status', required: 'T6 directory (read) or SCIM push',
    deps: ['T6', 'D1'], standards: 'SCIM 2.0; least privilege',
    sbb: { product: 'services/sync.js (Graph) + SCIM endpoint option',
      realization: 'Reads only app-assigned principals; deactivates leavers (never deletes); auditable via sync_runs.',
      location: 'apps/api/src/services/sync.js, apps/api/scim/scim.routes.js', maturity: 'Production-grade' } },
  { id: 'A6', domain: 'application', name: 'Content Access Broker', reuse: 'Reusable pattern',
    fn: 'Mediate authorised access to documents held in an external DMS, keeping the DMS the source of record.',
    provided: 'resolve document metadata + short-lived download URL; browse libraries', required: 'T6 DMS; A2 authZ',
    deps: ['T6', 'A2'], standards: 'Least privilege (Sites.Selected)',
    sbb: { product: 'services/sharepoint.js (Graph drive items)',
      realization: 'Per-site Sites.Selected grant; returns webUrl + short-lived download URL; version label is source of truth.',
      location: 'apps/api/src/services/sharepoint.js', maturity: 'Production-grade' } },
  { id: 'A7', domain: 'application', name: 'Outbound Notification Service', reuse: 'Enterprise-reusable',
    fn: 'Send transactional messages via an enterprise messaging platform.',
    provided: 'sendMail(to,subject,html)', required: 'T6 messaging platform',
    deps: ['T6'], standards: '—',
    sbb: { product: 'Graph sendMail (services/reminders.js)',
      realization: 'Sends from one mailbox; all interpolation HTML-escaped (M-2); no SMTP infra.',
      location: 'apps/api/src/services/reminders.js (sendMail)', maturity: 'Production-grade',
      alternatives: 'SMTP relay, SendGrid/Mailgun.' } },
  { id: 'A8', domain: 'application', name: 'Integration / Event Distribution', reuse: 'Reusable pattern',
    fn: 'Distribute domain events to external systems via push (webhook) and pull (authenticated feed).',
    provided: 'forward(event); GET /feed/audit', required: 'A11 events; D4 ledger',
    deps: ['A11', 'D4'], standards: '—',
    sbb: { product: 'logger.forwardEvent + /feed/audit',
      realization: 'Fire-and-forget webhook with SSRF guard; API-key pull feed with constant-time compare + own rate limit.',
      location: 'apps/api/src/logger.js, apps/api/src/app.js (/feed/audit)', maturity: 'Basic (no delivery guarantees/retry/DLQ)' } },
  { id: 'A9', domain: 'application', name: 'Backup & Recovery Service', reuse: 'Enterprise-reusable',
    fn: 'Produce recoverable datastore backups on a schedule and on demand, with retention and a tested restore path.',
    provided: 'scheduled + manual backup; list/download; restore', required: 'T4 datastore; T5 storage',
    deps: ['T4', 'T5', 'A10'], standards: 'ISO A.8.13 (backup)',
    sbb: { product: 'pg_dump + retention + restore docs',
      realization: 'Daily dump (retained); manual/server-side backups; DB creds passed via PG* env, never argv (L-3).',
      location: 'apps/api/src/server.js, apps/api/src/routes/admin.js (/admin/backup*), docs/RESTORE.md', maturity: 'Production-grade' } },
  { id: 'A10', domain: 'application', name: 'Scheduling / Task Orchestration', reuse: 'Reusable pattern',
    fn: 'Run recurring background jobs (backup, sync, reminders) on a schedule.',
    provided: 'periodic invocation of jobs', required: 'a runtime that stays resident',
    deps: ['T3'], standards: '—',
    sbb: { product: 'in-process setInterval + Postgres advisory-lock leader election',
      realization: 'Recurring jobs run in-process; a Postgres advisory lock (withLeaderLock) ensures exactly one replica runs them when scaled out.',
      location: 'apps/api/src/leader.js, apps/api/src/server.js (scheduleBackups/scheduleDaily)', maturity: 'Production-grade (advisory-lock leader election; ADR-119)',
      alternatives: 'Cron container, platform cron job, Azure Functions Timer, job queue.' } },
  { id: 'A11', domain: 'application', name: 'Observability / Audit Forwarding', reuse: 'Enterprise-reusable',
    fn: 'Emit structured, correlatable logs with secret redaction and feed them to aggregation/SIEM.',
    provided: 'structured log events; request correlation id; SIEM feed', required: 'T8 aggregation',
    deps: ['T8'], standards: 'SIEM-friendly JSON',
    sbb: { product: 'pino + pino-http + prom-client',
      realization: 'JSON to stdout; auth/secret fields redacted; per-request x-request-id echoed on errors; RED metrics on /metrics and a DB-checked /readyz.',
      location: 'apps/api/src/logger.js, apps/api/src/metrics.js, apps/api/src/app.js (/metrics, /readyz)', maturity: 'Production-grade (aggregation is a deployment concern)' } },

  { id: 'A12', domain: 'application', name: 'Object Storage Abstraction', reuse: 'Reusable pattern',
    fn: 'Abstract file persistence behind a driver so local disk or cloud object storage are interchangeable without re-architecture.',
    provided: 'put/get/delete a file via a driver interface',
    required: 'T5 storage', deps: ['T5'], standards: 'Server-determined content type + nosniff',
    sbb: { product: 'storage.js (local driver; Azure Blob target)',
      realization: 'Pluggable driver; UUID filenames; extension allowlist; server-determined content type; swappable to Blob with no route changes.',
      location: 'apps/api/src/storage.js, apps/api/src/uploads.js', maturity: 'Production-grade (local driver; object-storage target)' } },
  { id: 'A13', domain: 'application', name: 'Shared Rate-Limit Store', reuse: 'Reusable pattern',
    fn: 'Enforce request throttling with a store that can be shared across replicas for multi-instance correctness.',
    provided: 'fixed-window request counters per route',
    required: 'A3 edge; an optional shared cache', deps: ['A3'], standards: 'Abuse protection',
    sbb: { product: 'ratelimit.js (in-memory default; Redis via RATE_LIMIT_REDIS_URL)',
      realization: 'Pluggable store; per-route limiters (/api, /api/sync, /feed); a shared Redis store keeps limits correct across instances (ADR-119).',
      location: 'apps/api/src/ratelimit.js, apps/api/src/app.js', maturity: 'Production-grade (in-memory default; Redis optional)' } },
  { id: 'A14', domain: 'application', name: 'Experience Preference / Theming', reuse: 'Reusable pattern',
    fn: 'Provide user-selectable light/dark theming applied before first paint.',
    provided: 'theme toggle; persisted per-device preference',
    required: 'A4 presentation', deps: ['A4'], standards: 'WCAG contrast',
    sbb: { product: 'theme.js + _tokens.css',
      realization: 'Design tokens; localStorage gp-theme; OS-preference default; applied from the bundle (CSP-safe, no inline script).',
      location: 'apps/web/src/theme.js, apps/web/src/_tokens.css, apps/web/src/main.jsx', maturity: 'Production-grade' } },

  // ── Technology ───────────────────────────────────────────
  { id: 'T1', domain: 'technology', name: 'Identity Provider (OIDC/OAuth2)', reuse: 'Enterprise-shared service (consumed)',
    fn: 'Authenticate users and issue federated access tokens with roles/scopes.',
    provided: 'OIDC/OAuth2 endpoints, JWKS, app roles', required: '—', deps: [], standards: 'OIDC, OAuth 2.0',
    sbb: { product: 'Microsoft Entra ID',
      realization: 'SPA + API app registrations; app roles Governance.Admin/Manager; MFA/Conditional Access org-side.',
      location: 'apps/web/src/app.jsx (MSAL config), apps/api/src/config.js', maturity: 'Enterprise-shared',
      alternatives: 'Okta, Auth0, Keycloak.' } },
  { id: 'T2', domain: 'technology', name: 'HTTP Edge / TLS Termination', reuse: 'Reusable pattern',
    fn: 'Terminate TLS and route HTTP at the edge.',
    provided: 'TLS, virtual hosting, proxying, static serving', required: '—', deps: [], standards: 'TLS 1.2/1.3',
    sbb: { product: 'nginx (alpine)',
      realization: 'TLS 1.2/1.3; serves SPA; proxies /api; security headers/CSP.',
      location: 'apps/web/nginx.conf, apps/web/Dockerfile', maturity: 'Production-grade' } },
  { id: 'T3', domain: 'technology', name: 'Application Runtime / Container Platform', reuse: 'Reusable pattern',
    fn: 'Execute the application as containers with health, restart and resource control.',
    provided: 'container runtime, scheduling, health/restart', required: '—', deps: [], standards: 'OCI',
    sbb: { product: 'Node 22 + Docker Compose (Azure Container Apps target)',
      realization: 'Multi-stage builds; non-root; healthchecks; restart: unless-stopped; loopback-only DB port.',
      location: 'deploy/docker-compose.yml, apps/*/Dockerfile', maturity: 'Production-grade (single host)' } },
  { id: 'T4', domain: 'technology', name: 'Relational DBMS with privilege-based access control', reuse: 'Reusable pattern',
    fn: 'Persist relational data and enforce integrity, with a privilege model that can revoke mutation.',
    provided: 'SQL, transactions, views, role-based grants, advisory locks', required: '—', deps: [], standards: 'SQL; ACID',
    sbb: { product: 'PostgreSQL 16',
      realization: 'Non-owner app role; append-only ledgers via REVOKE; advisory locks for race-safe writes; CTEs/JSONB for reporting.',
      location: 'apps/api/db/*, apps/api/src/db.js', maturity: 'Production-grade',
      alternatives: 'SQL Server, MySQL (with equivalent grant model).' } },
  { id: 'T5', domain: 'technology', name: 'Object / File Storage', reuse: 'Reusable pattern',
    fn: 'Store and serve uploaded binary files (training material, backups).',
    provided: 'put/get files', required: '—', deps: [], standards: '—',
    sbb: { product: 'mounted Docker volume (Azure Blob target)',
      realization: 'UUID filenames; extension allowlist; server-determined content type + nosniff on serve.',
      location: 'apps/api/src/storage.js, apps/api/src/uploads.js, deploy/docker-compose.yml (volumes)', maturity: 'Local volume (no replication); target: object storage' } },
  { id: 'T6', domain: 'technology', name: 'Directory & Collaboration Platform', reuse: 'Enterprise-shared service (consumed)',
    fn: 'Provide directory data, document storage and messaging APIs.',
    provided: 'users/groups read, SharePoint drive items, sendMail', required: '—', deps: [], standards: 'Microsoft Graph',
    sbb: { product: 'Microsoft Graph (Entra/SharePoint/Exchange)',
      realization: 'App-only via Managed Identity in prod; Sites.Selected; assigned-principals-only reads.',
      location: 'apps/api/src/graph.js, services/sharepoint.js, services/sync.js', maturity: 'Enterprise-shared' } },
  { id: 'T7', domain: 'technology', name: 'Secrets Management', reuse: 'Enterprise-shared service (consumed)',
    fn: 'Store and deliver application secrets (DB creds, client secret) securely.',
    provided: 'secret storage + retrieval', required: '—', deps: [], standards: 'ISO A.5.17',
    sbb: { product: '.env on disk now → Azure Key Vault + Managed Identity (target)',
      realization: 'Code already supports DefaultAzureCredential (no stored secret); on-prem uses .env (gitignored).',
      location: 'apps/api/src/graph.js, apps/api/src/config.js', maturity: 'Weak (secrets on disk); target: Key Vault + Managed Identity' } },
  { id: 'T8', domain: 'technology', name: 'Log Aggregation / SIEM', reuse: 'Enterprise-shared service (consumed)',
    fn: 'Aggregate, retain and alert on application/audit logs.',
    provided: 'ingest, search, alert', required: '—', deps: [], standards: 'ISO A.8.16',
    sbb: { product: 'stdout JSON → external SIEM (via feed/forward)',
      realization: 'Structured logs + audit feed/forward exist; aggregation + alerting is an org deployment (gap).',
      location: 'apps/api/src/logger.js', maturity: 'Optional (aggregation not deployed)' } },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const byId = Object.fromEntries(CATALOG.map((a) => [a.id, a]));
const depLink = (id) => `[${id} ${byId[id] ? byId[id].name : ''}](../${slug(byId[id]?.name || id) ? `${id}-${slug(byId[id].name)}` : id}/ABB.md)`;

function abbMd(a) {
  const deps = a.deps.length ? a.deps.map((d) => `\`${d}\` ${byId[d] ? byId[d].name : ''}`).join(', ') : '—';
  return `# ${a.id} — ${a.name} (ABB)

- **Domain:** ${DOMAINS[a.domain]}
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** ${a.reuse}

## Capability (fundamental functionality)
${a.fn}

## Interfaces
- **Provided:** ${a.provided}
- **Required:** ${a.required}

## Dependencies (other ABBs)
${deps}

## Standards / NFRs
${a.standards}

## Realization
Realized in this solution by the SBB in [\`sbb/SBB.md\`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
`;
}

function sbbMd(a) {
  return `# SBB — ${a.sbb.product}

_Solution Building Block realizing ABB **${a.id} ${a.name}** in the Birgma Governance Portal._

## Realization
${a.sbb.realization}

## Where it lives (code)
\`${a.sbb.location}\`

## Maturity
${a.sbb.maturity}
${a.sbb.alternatives ? `\n## Alternative SBBs that could realize this ABB\n${a.sbb.alternatives}\n` : ''}`;
}

// ── Emit the tree ────────────────────────────────────────────
let made = 0;
for (const a of CATALOG) {
  const dir = path.join(ROOT, a.domain, `${a.id}-${slug(a.name)}`);
  fs.mkdirSync(path.join(dir, 'sbb'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ABB.md'), abbMd(a));
  fs.writeFileSync(path.join(dir, 'sbb', 'SBB.md'), sbbMd(a));
  made++;
}

// Index / catalogue
const rows = CATALOG.map((a) =>
  `| ${a.id} | [${a.name}](${a.domain}/${a.id}-${slug(a.name)}/ABB.md) | ${a.sbb.product.split(';')[0]} | ${a.reuse} |`).join('\n');
const catalog = `# Architecture Repository — ABB / SBB Catalogue

One row per Architecture Building Block (neutral capability) and the Solution
Building Block that realizes it in the Birgma Governance Portal. Generated by
\`tools/generate.mjs\` from a single manifest.

| ABB | Capability | Realizing SBB | Reuse |
|-----|------------|---------------|-------|
${rows}

_Domains: Business · Data · Application · Technology (TOGAF). Counts: ${CATALOG.length} ABBs._
`;
fs.writeFileSync(path.join(ROOT, 'CATALOG.md'), catalog);

console.log(`Generated ${made} ABB directories (+ ${made} SBBs) and CATALOG.md under ${ROOT}`);
