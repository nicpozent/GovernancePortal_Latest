# B7 — Compliance Reporting & Assurance (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Reusable pattern

## Capability (fundamental functionality)
Prove compliance status to auditors and leadership across policy, unit and group.

## Interfaces
- **Provided:** aggregate required-vs-signed; per-group/department breakdown; CSV export
- **Required:** D2 catalogue; D3 ledger; D1 identity

## Dependencies (other ABBs)
`D1` Identity & Organisation Master Data, `D2` Obligation Catalogue, `D3` Immutable Attestation Ledger

## Standards / NFRs
ISO A.5.36 (compliance review)

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
