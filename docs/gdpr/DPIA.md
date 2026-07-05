# Data Protection Impact Assessment (DPIA) — Governance Portal
**Status: DRAFT for controller review.** A DPIA may not be strictly mandatory here (no
special-category data, no large-scale profiling), but this is a low-cost record that
demonstrates Art. 25/35 diligence. Fill `‹…›` and have the DPO sign. Not legal advice.

## 1. Is a DPIA required?
Likely **not mandatory** (Art. 35): no special-category/criminal data, no systematic
large-scale monitoring, no automated decisions with legal effect. Processing is
employee compliance record-keeping. This DPIA is kept **voluntarily** as good practice.
‹Confirm with DPO.›

## 2. Description of processing
- **Nature:** capture and store acknowledgements/quiz results as compliance evidence.
- **Scope:** ‹N› employees of ‹org›; data listed in `ROPA.md`.
- **Context:** internal workforce system behind Entra SSO; single-tenant.
- **Purpose & basis:** legal obligation / legitimate interest (see ROPA).

## 3. Necessity & proportionality
- **Data minimisation:** directory sync reads only 5 attributes for *app-assigned*
  users (not the whole tenant); SharePoint access is `Sites.Selected`; documents are
  private-by-default and membership-gated. (Verified in code.)
- **The one proportionality call — IP + user-agent on signatures:** stored to make an
  acknowledgement reliable non-repudiable evidence. Assessed as **proportionate** for
  that purpose; it is disclosed in the privacy notice. ‹DPO to confirm acceptance.›
- **Retention:** time-boxed to ‹10› years with a purge tool (not indefinite).

## 4. Risks to data subjects & mitigations
| Risk | Likelihood / impact | Mitigation (in place unless noted) |
|---|---|---|
| Unauthorised access to records | Low / Med | Entra SSO, RBAC, private-by-default, least-privilege DB role |
| Tampering with compliance evidence | Low / High | Append-only ledgers (DB-grant enforced + tested); optional SIEM forwarding |
| Data loss | Low / High | Backups + tested DR runbook; ‹enable off-host schedule› |
| Confidentiality at rest | **Med / Med — OPEN** | **Enable BitLocker/CMK + `PGSSL=require`** (`SECURITY-REVIEW.md §6b`) |
| Excessive retention | Low / Med | Retention purge tool + documented period |
| Over-collection from directory | Low / Low | Assigned-users-only sync, 5-attribute select |
| Account/token compromise | Med / High | ‹Enable MFA / Conditional Access in Entra — org action› |

## 5. Residual risk & sign-off
After mitigations, residual risk is assessed **‹low›**, contingent on closing the two
OPEN items (at-rest encryption, MFA/CA). 

- DPO opinion: ‹…›   Date: ‹…›
- Decision to proceed: ‹approved / approved-with-conditions›   Owner: ‹…›
- Review date: ‹…›
