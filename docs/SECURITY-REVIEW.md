# Birgma Governance Portal — Security Assessment

Scope: the portal as deployed (web/api/db containers on a Windows VM behind
Microsoft Entra ID). Frameworks applied: **STRIDE** (threat model), **MITRE
ATT&CK** (techniques & mitigations), **ISO/IEC 27001:2022 Annex A** (controls),
**GDPR** (data-protection obligations). Honest verdict up front, then the detail.

> **Verdict:** The application layer is **solid** for its threat model — delegated
> Entra auth, server-side RBAC, parameterized SQL, append-only audit/signature
> ledgers, escaped output, upload allowlisting, TLS in transit. The residual risk
> is almost entirely at the **hosting/operations layer** (secrets on disk, host
> access, backups containing secrets, no at-rest encryption by default) — all
> known and tracked. It is **suitable for internal production** once the
> hardening items in §6 are done; full ISO/GDPR "compliance" is an
> organisational programme, not just a codebase property.

---

## 1. Data processed (GDPR relevance)
Personal data: employee name, email/UPN, department, job title, manager
relationship, and **acknowledgement signatures** (who signed what, when, from
which IP/user-agent), quiz attempts/scores. This is **HR/compliance** personal
data — not special-category, but the IP + behavioural record makes it sensitive.
Lawful basis is typically **legal obligation / legitimate interest** (workplace
compliance). Controller = Birgma; the app is the processing system.

---

## 2. STRIDE threat model
| Threat | Exposure | Controls in place | Residual / action |
|--------|----------|-------------------|-------------------|
| **S**poofing | Impersonating a user/service | Entra ID SSO; JWT signature/issuer/audience/**tenant**/scope validated; delegated-only (app-only tokens rejected, ADR/M1) | Enforce **MFA/Conditional Access** in Entra (org-side) |
| **T**ampering | Altering data / in transit | TLS browser↔nginx; parameterized SQL; append-only `signatures`/`audit_log`/`quiz_attempts` (no UPDATE/DELETE grant); server-determined upload content-type | Enable **at-rest encryption** (BitLocker / Azure CMK); optional DB TLS |
| **R**epudiation | "I didn't sign that" | Signatures bind verified `oid`+name+version+timestamp+IP; append-only audit log of admin actions | Ship audit logs to a WORM/SIEM store for long-term non-repudiation |
| **I**nformation disclosure | Reading others' data/docs | RBAC; document/file/quiz reads require group membership (M5); unassigned = private; CSP; `nosniff`; no SharePoint tenant-wide read (`Sites.Selected`) | At-rest encryption; restrict backups (below) |
| **D**enial of service | Overload / resource exhaustion | Rate limiting; upload size cap (250 MB); container log rotation; healthchecks + `restart: unless-stopped` | Front with WAF/Front Door for internet exposure; tune rate limits |
| **E**levation of privilege | Becoming admin | App-role gated (`Governance.Admin`/`Manager`); managers scoped to own content/team; least-privilege DB role; SCIM uses isolated token | Add a **Compliance** role for finer separation; periodic admin access review |

---

## 3. MITRE ATT&CK — relevant techniques & mitigations
| Technique | Relevance | Mitigation status |
|-----------|-----------|-------------------|
| **T1190** Exploit public-facing app | nginx/API exposed | Patched base images; no SQLi (parameterized); upload allowlist; tightened CSP. Add WAF if internet-facing. |
| **T1059 / T1505.003** Web shell via upload | Manager uploads | Extension allowlist; server-set content-type + `nosniff`; files served from a path, not executed. ✅ |
| **T1078** Valid accounts / token abuse | Stolen token / app-only | Delegated-only tokens; 15-min idle logout; tenant pinned. Add Conditional Access + token lifetime policy. |
| **T1552** Unsecured credentials | `.env`, TLS key, client secret on disk | **Gap (on-prem):** protect via BitLocker + ACLs; move to **Key Vault + Managed Identity** (no stored secret). |
| **T1530** Data from cloud/host storage | Backup zips, DB volume | Backups exclude `.env`/certs; **but DB dump is plaintext** — store encrypted, off-host, access-controlled. |
| **T1110** Brute force | DB port / login | Login is via Entra (no local pw); DB bound to **loopback only**. Remove published port for prod. |
| **T1040 / T1557** Network sniffing/MITM | In-transit | TLS at the edge; internal hops stay on the host's Docker network. Optional in-cluster TLS. |
| **T1485/T1486** Data destruction/ransomware | DB volume | Daily + manual backups; tested **restore** procedure (RESTORE.md). Keep off-host copies. |

---

## 4. ISO/IEC 27001:2022 Annex A — control mapping (selected)
| Control | Status | Evidence / gap |
|---------|--------|----------------|
| A.5.15 Access control | ✅ | Entra app roles; server-side RBAC |
| A.5.16 Identity management | ✅ | Entra identities; group→role; SCIM/AU-scoped sync |
| A.5.17 Authentication info | ◑ | No app passwords (good); **secrets on disk** (improve via Key Vault) |
| A.5.18 Access rights (JML) | ✅ | Group membership = onboarding/offboarding; Former-employees retained |
| A.8.2 Privileged access | ◑ | Admin/Manager roles; add Compliance role + access reviews |
| A.8.5 Secure authentication | ✅/org | Delegated tokens; **enable MFA/CA in Entra** |
| A.8.9 Configuration mgmt | ✅ | Compose + migrations versioned; reproducible builds (lockfile) |
| A.8.12 Data leakage prevention | ◑ | RBAC + private-by-default; add DLP/at-rest encryption |
| A.8.13 Backup | ✅ | Automated + manual + full-app backups; restore tested |
| A.8.15 Logging | ✅ | Append-only audit log of admin actions |
| A.8.16 Monitoring | ✗ | **Gap:** no alerting/SIEM; add health + failure alerts, log shipping |
| A.8.24 Cryptography | ◑ | TLS in transit; **at-rest not enabled by default** (BitLocker/CMK) |
| A.8.25/8.26/8.28 Secure development | ✅ | Parameterized SQL, output escaping, upload allowlist, CSP, threat model |

✅ in place · ◑ partial / hardening recommended · ✗ gap.

---

## 5. GDPR — obligations & status
| Article / principle | Status | Note |
|---------------------|--------|------|
| Art.5 Integrity & confidentiality | ◑ | Strong access control + audit; complete with at-rest encryption |
| Art.6 Lawful basis | org | Document basis (legal obligation/legitimate interest) in your RoPA |
| Art.15/20 Right of access & portability | ✅ | Subjects self-view on *My signatures*; admins get a full machine-readable per-subject export via `GET /api/admin/data-subject/:oid/export` (or `npm run gdpr -- export`), audited. Follow the DSAR process in `GDPR-DATA-RIGHTS.md`. |
| Art.17 Erasure | ✅ (tooling) / org (decision) | Leavers are retained for audit (Art.17(3)(b) exemption). When lawful erasure IS required it is performed by the privileged CLI `npm run gdpr -- erase --oid <oid> --apply` (personal records deleted, audit pseudonymised) — the app role still cannot delete the ledger. Retention purge: `npm run gdpr -- retention`. Runbook: `GDPR-DATA-RIGHTS.md`. |
| Art.25 Data protection by design/default | ✅ | Private-by-default docs, least privilege, minimal Graph scope |
| Art.30 Records of processing | org | Add this system to your RoPA |
| Art.32 Security of processing | ◑ | This document is your technical-measures evidence; close §6 gaps |
| Art.33 Breach notification | org | Define detection→notification runbook (ties to monitoring gap) |
| IP-address storage | ◑ | Signatures store IP/user-agent (proportionate for non-repudiation) — **state it in your privacy notice** and set retention |

org = organisational/process action, not a code change.

---

## 6. Prioritised hardening (close the residual risk)
1. **Enable MFA / Conditional Access** in Entra for both app registrations. (Biggest single win; org-side, no code.)
2. **At-rest encryption** — BitLocker on the VM disk (covers DB volume, backups, uploads), or Azure CMK in the cloud model.
3. **Secrets** — move to **Key Vault + Managed Identity** (eliminates the on-disk client secret); until then, tight ACLs + BitLocker on `.env`/`certs`.
4. **Backups** — store the (plaintext) DB dumps encrypted, off-host, access-controlled; rotate.
5. **Drop the published DB port** entirely for prod (currently loopback-only).
6. **Monitoring/alerting** — ship api/db logs + audit log to a SIEM; alert on auth failures, sync/backup failures (closes A.8.16 and supports GDPR Art.33).
7. **Finer roles + access reviews** — add a Compliance role; quarterly review of `Governance.Admin` holders.
8. **CSP already tightened** (Vite build dropped `unsafe-eval`/CDN); keep libraries patched.
9. **Document the org artefacts** — RoPA entry, retention policy, privacy-notice wording for IP storage, DSAR + breach runbooks. → drafts now in `docs/gdpr/` (`ROPA.md`, `DPIA.md`, `PRIVACY-NOTICE.md`) — **review and formally adopt them.**

---

## 6b. Enabling encryption (operator actions — the app supports both today)

These two are *off by default* and can only be turned on outside the app. The
application already supports both; enabling them is a host/DB action.

**A. Encryption at rest (Art. 32 / A.8.24).** The `pgdata` volume, `deploy/backups/`,
and `deploy/uploads/` are plaintext on disk, and `pg_dump` output is plaintext.
- **On the current Windows VM:** enable **BitLocker** on the drive that holds the
  Docker volumes + backups + uploads (`manage-bde -on C: -UsedSpaceOnly`, then
  escrow the recovery key). This covers all three assets and the `.env`/`certs` at once.
- **On Azure (target):** use platform encryption / **customer-managed keys (CMK)**
  on the managed Postgres + Storage account; no host step needed.
- Either way, keep off-host backup copies encrypted (the DR runbook already flags this).

**B. TLS on the API→Postgres hop (Art. 32).** Today it's loopback-only and runs
without TLS (`PGSSL` unset → `ssl:false`). To require it (needed once the DB is on a
separate host / Azure):
1. Give Postgres a server certificate (Azure DB for PostgreSQL has one already; for
   self-hosted, configure `ssl=on` + `ssl_cert_file`/`ssl_key_file`).
2. Set **`PGSSL=require`** in `apps/api/.env`. `config.js`/`db.js` then connect with
   `ssl:{ rejectUnauthorized:true }` — verified TLS, no code change needed.

---

## 7. Summary
- **Application security:** strong and intentional — authn/z, injection, output,
  uploads, audit integrity, data minimisation are all addressed.
- **Operational/hosting security:** the real residual risk — secrets at rest,
  host access, plaintext backups, no monitoring. All known, none architectural,
  all closable with §6.
- **Compliance posture:** the technical measures support ISO 27001 and GDPR
  Art.32; achieving certification/compliance also needs the organisational
  artefacts (RoPA, retention, DSAR/breach processes, access reviews) listed above.

_This is an internal technical assessment, not a formal audit or legal advice._
