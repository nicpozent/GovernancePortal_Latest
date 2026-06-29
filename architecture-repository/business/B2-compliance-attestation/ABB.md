# B2 — Compliance Attestation (ABB)

- **Domain:** Business Architecture
- **Type:** Architecture Building Block (technology-neutral capability)
- **Reuse classification:** Enterprise-reusable

## Capability (fundamental functionality)
Capture a binding "I have read and understood" act, bound to a verified identity and a document version.

## Interfaces
- **Provided:** record an acknowledgement; report a person's attestation status
- **Required:** A1 verified identity; D3 attestation ledger; (optional) B3 gate

## Dependencies (other ABBs)
`A1` Identity Federation / Token Validation, `D3` Immutable Attestation Ledger, `B3` Competency Verification

## Standards / NFRs
Non-repudiation; GDPR Art.5 integrity

## Realization
Realized in this solution by the SBB in [`sbb/SBB.md`](sbb/SBB.md).

> ABB = *what capability must exist* (product-neutral). The SBB = *how it is built here*.
