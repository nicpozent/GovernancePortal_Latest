# B10 — Data-Subject Rights (GDPR) (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Operate data-subject access, erasure and retention duties without breaking append-only evidence.

## Interfaces
- **Provided:** DSAR export; lawful erasure (pseudonymize/redact); retention purge
- **Required:** D1 identity; D3/D4 ledgers

## Dependencies (other ABBs)
`D1` Identity & Organisation Master Data, `D3` Immutable Attestation Ledger, `D4` Immutable Audit Ledger

## Standards / NFRs
GDPR Art.15/17/5; ISO 27001 A.5.34

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
