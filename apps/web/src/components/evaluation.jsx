/* Admin → Application Evaluation. Evidence-based maturity scorecard, mirroring
   docs/APPLICATION-EVALUATION.md (the source of record). Static, read-only. */

const TIER = { 5: ['var(--c1f7a5c)', 'Excellent'], 4: ['var(--c213a9e)', 'Strong'], 3: ['var(--cb8860b)', 'Adequate'], 2: ['var(--cc0143c)', 'Partial'] };
const TILES = [
  ['Overall', '4.3', '/5', 'Internal-production-ready'],
  ['Dimensions at ★★★★★', '6', '/18', 'Eleven more at ★★★★☆'],
  ['Automated tests', '89', '', '71 API · 18 web + compose smoke e2e'],
  ['Compliance', '39', '', 'controls mapped, CI-gated · 19 ATT&CK techniques'],
];
const ROWS = [
  [1, 'Functional coverage', 'policy governance', 5, 'Policy acknowledgement + version re-sign, quizzes with gated signing, manager trainings & uploads, groups + effective-membership, Entra directory sync, admin/manager dashboards, pull/push audit feed; approval workflow delivered (ADR-120, Phases 1–2d: ordered steps with all/any/quorum, person + directory-group approvers, reusable templates, append-only decision ledger)', '—'],
  [2, 'Architecture & modularity', '', 5, 'Three-tier (React SPA / Node-Express / PostgreSQL); API split into per-domain route modules; auth/authz/storage/leader/rate-limit extracted; 20 ADRs + TOGAF ABB/SBB catalogue', '—'],
  [3, 'Frontend engineering', '', 4, 'React 18 + Vite 8; app.jsx decomposed 2,613 → 668 lines into domain component modules; ESLint flat config (0 errors); code→friendly-message mapping', 'JavaScript, not TypeScript; component/render tests thin'],
  [4, 'Identity & access', '', 5, 'Entra SSO (MSAL, PKCE); RS256-pinned token validation (issuer/audience/tenant/scope); app-only tokens rejected; app roles; 15-min idle logout', 'MFA / Conditional Access is Entra-side, not app-enforced'],
  [5, 'Authorization model', '', 5, 'Server-enforced RBAC (Admin/Manager) + per-object ownership + effective-group-membership gates; integration-tested; no IDOR found', '—'],
  [6, 'Data & persistence', '', 5, 'PostgreSQL 16; least-privilege app role; append-only signature/audit/quiz ledgers enforced by DB grants; tracked transactional migration runner', '—'],
  [7, 'Security & hardening', '', 4, 'Token hardening, parameterized SQL, upload allowlist + server-set content type, CSP/headers, single-origin CORS, pluggable rate limiting, no committed secrets', 'At-rest encryption off by default (host); DNS-rebind SSRF residual; SAST non-blocking; no pen-test'],
  [8, 'Data protection / GDPR', '', 4, 'Per-subject DSAR export; append-only-preserving erasure + retention CLI; data minimization (5-attr Graph, Sites.Selected); drafted ROPA/DPIA/notice', 'Adopt artefacts (DPO sign-off); breach runbook planned'],
  [9, 'Compliance frameworks', '', 4, 'Controls-as-code: 39 controls mapped to ISO 27001 / NIST CSF / GDPR / Zero Trust / MITRE ATT&CK (19 techniques); CI-gated coverage; AI-framework N/A documented', 'Zero-Trust pillar write-up + SoA adoption pending'],
  [10, 'Observability', '', 4, 'Structured pino logs + correlation ids + secret redaction; Prometheus /metrics (RED + runtime); DB-checked /readyz; container healthchecks; log-shipping + alert design', 'SIEM wiring is an operator step; no distributed tracing yet'],
  [11, 'Testing', '', 4, '71 API tests (node:test unit + integration on real Postgres) + 18 web (vitest) + docker-compose smoke e2e; coverage-gated (78% lines / 70% branches)', 'No load/perf; UI click-through e2e minimal'],
  [12, 'CI/CD', '', 4, 'GitHub Actions: CI (lint/tests/PG integration/coverage), security (gitleaks/Trivy/semgrep + compliance gate), smoke e2e; Dependabot', 'No automated deploy pipeline (deferred to Azure)'],
  [13, 'Reliability / HA / DR', '', 4, 'Rehearsed DR runbook; off-host DB + uploads backups; app tier stateless-ready (Azure Blob storage, advisory-lock leader election, shared Redis rate-limit)', 'Single-instance today; no PITR/replication until Azure'],
  [14, 'Delivery & runtime', '', 3, 'Docker Compose on a Windows VM + nginx edge; per-service resource limits; healthchecks; TLS termination', 'Single-node; no IaC / k8s; manual deploy; Azure target un-codified'],
  [15, 'Async / background work', '', 4, 'Daily backup + directory sync + reminders on timers; multi-instance-safe via a Postgres advisory-lock leader election', 'In-process timers, not an external queue (documented trade-off)'],
  [16, 'Governance & documentation', '', 5, 'Deep architecture + 20 ADRs + ABB/SBB; install / DR / migrations / observability guides; GDPR pack; troubleshooting with a full 32-code error catalogue; security review; frameworks doc', '—'],
  [17, 'Maintainability / DX', '', 4, 'Modular API + decomposed frontend; consistent patterns; lint + coverage gates; Dependabot; controls-as-code; no TODO/FIXME debt', 'Frontend not TypeScript'],
  [18, 'Supply chain', '', 4, 'Committed lockfiles + npm ci; grouped Dependabot; npm audit + Trivy gates; gitleaks with a reviewed allowlist; Managed Identity in production', 'Dev secret in .env (Key Vault is the target); semgrep non-blocking'],
];
const RISKS = [
  ['med', 'Medium', 'Enable MFA / Conditional Access', 'The single biggest access control; enforced in Entra, not something the app can guarantee'],
  ['med', 'Medium', 'Turn on at-rest encryption + PGSSL', 'GDPR Art. 32 depends on host BitLocker/CMK and DB-hop TLS — both supported but off by default'],
  ['low', 'Low', 'Adopt the GDPR artefacts', 'ROPA / DPIA / privacy notice are drafted from real behaviour; they need DPO review and sign-off'],
  ['low', 'Low', 'Incident-response + breach runbook', 'IR-01 / GDPR-04 are tracked as planned controls (DR exists; security IR does not yet)'],
  ['low', 'Low', 'Azure migration (IaC + CD + managed PG)', 'Deferred by choice; absorbs CD, HA edge, PITR, private networking and at-rest in one move'],
];
const PILL = { med: ['var(--c9a6712)', 'var(--cfbf1d9)'], low: ['var(--c1f7a5c)', 'var(--ce6f3ec)'], hi: ['var(--cc0143c)', 'var(--cfbe7ec)'] };

const card = { background: 'var(--surface)', border: '1px solid var(--ce6e8ee)', borderRadius: '14px', boxShadow: '0 1px 3px rgba(20,30,80,.06)' };
const mono = '"IBM Plex Mono",monospace';
const th = { textAlign: 'left', font: '600 11px/1 ' + mono, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c9aa1b2)', padding: '13px 16px', borderBottom: '1px solid var(--ce6e8ee)', background: 'var(--cf7f8fb)', whiteSpace: 'nowrap' };
const td = { padding: '14px 16px', borderBottom: '1px solid var(--ceef1f6)', verticalAlign: 'top', font: '400 13.5px/1.5 "IBM Plex Sans"', color: 'var(--c41485a)' };
const secHead = { font: '600 11px/1 ' + mono, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--c9aa1b2)', margin: '30px 0 12px' };

function Dots({ n }) {
  const c = TIER[n][0];
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '5px' }}>
      <span style={{ display: 'inline-flex', gap: '3px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', background: i <= n ? c : 'var(--ce2e6f3)' }}></span>
        ))}
      </span>
      <span style={{ font: '600 11px/1 ' + mono, letterSpacing: '.04em', textTransform: 'uppercase', color: c }}>{TIER[n][1]}</span>
    </span>
  );
}

export function AppEvaluation() {
  return (
    <div style={{ maxWidth: '1080px' }}>
      {/* summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '10px' }}>
        {TILES.map((t, i) => (
          <div key={i} style={{ ...card, padding: '18px' }}>
            <div style={{ font: '600 11px/1 ' + mono, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--c9aa1b2)', marginBottom: '8px' }}>{t[0]}</div>
            <div style={{ font: '700 30px/1 "IBM Plex Sans"', color: 'var(--c161a26)', letterSpacing: '-.02em' }}>{t[1]}<span style={{ font: '600 15px/1 "IBM Plex Sans"', color: 'var(--c9aa1b2)' }}>{t[2]}</span></div>
            <div style={{ font: '400 12.5px/1.4 "IBM Plex Sans"', color: 'var(--c6b7280)', marginTop: '5px' }}>{t[3]}</div>
          </div>
        ))}
      </div>

      <div style={secHead}>Scorecard</div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '760px' }}>
            <thead><tr><th style={{ ...th, width: '30px' }}>#</th><th style={th}>Dimension</th><th style={th}>Rating</th><th style={th}>Evidence</th><th style={th}>Gaps / next</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]}>
                  <td style={{ ...td, font: '400 12.5px/1.5 ' + mono, color: 'var(--c9aa1b2)' }}>{r[0]}</td>
                  <td style={{ ...td, font: '600 13.5px/1.4 "IBM Plex Sans"', color: 'var(--c1a1d29)' }}>{r[1]}{r[2] ? <span style={{ color: 'var(--c9aa1b2)', fontWeight: 400 }}> {r[2]}</span> : null}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}><Dots n={r[3]} /></td>
                  <td style={{ ...td, maxWidth: '46ch' }}>{r[4]}</td>
                  <td style={{ ...td, maxWidth: '32ch', color: 'var(--c6b7280)' }}>{r[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={secHead}>Top risks & next steps</div>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '640px' }}>
            <thead><tr><th style={th}>Priority</th><th style={th}>Item</th><th style={th}>Why</th></tr></thead>
            <tbody>
              {RISKS.map((k, i) => (
                <tr key={i}>
                  <td style={td}><span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '20px', font: '600 11px/1.5 ' + mono, color: PILL[k[0]][0], background: PILL[k[0]][1] }}>{k[1]}</span></td>
                  <td style={{ ...td, font: '600 13.5px/1.4 "IBM Plex Sans"', color: 'var(--c1a1d29)' }}>{k[2]}</td>
                  <td style={{ ...td, maxWidth: '52ch' }}>{k[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={secHead}>Verdict</div>
      <div style={{ ...card, borderLeft: '4px solid var(--c1f7a5c)', padding: '20px 22px' }}>
        <div style={{ font: '700 16px/1.3 "IBM Plex Sans"', color: 'var(--c161a26)', marginBottom: '8px' }}>Strong — production-ready for a single-instance internal deployment</div>
        <p style={{ margin: 0, font: '400 14px/1.6 "IBM Plex Sans"', color: 'var(--c54607a)', maxWidth: '82ch' }}>
          A complete, well-architected policy-governance system: Entra-secured, server-enforced RBAC over append-only compliance
          ledgers, tested (89 automated tests + a docker-compose smoke e2e), observable (Prometheus metrics + DB-checked readiness),
          and documented to a professional standard (20 ADRs, TOGAF ABB/SBB, full runbooks). HA groundwork makes the app tier
          stateless-ready; a rehearsed DR runbook with off-host backups, GDPR subject-rights tooling, and a CI-gated controls-as-code
          catalogue (39 controls across ISO 27001 · NIST CSF · GDPR · Zero Trust · MITRE ATT&CK; ISO 42001 / EU AI Act scoped out — no
          AI) round it out. Remaining items are operator or organizational actions and the deferred Azure migration — not code
          defects. The per-version policy approval workflow (ADR-120) — the one designed-but-unbuilt feature at the original
          review — has since been delivered (Phases 1–2d).
        </p>
      </div>

      <div style={{ font: '400 12px/1.5 ' + mono, color: 'var(--ca7adbd)', marginTop: '22px' }}>
        Source of record: docs/APPLICATION-EVALUATION.md · compliance/controls.json · ratings mirror the repository at review time.
      </div>
    </div>
  );
}
