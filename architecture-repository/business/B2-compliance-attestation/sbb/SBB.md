# SBB — signatures ledger + sign flow

_Solution Building Block realizing ABB **B2 Compliance Attestation** in the Birgma Governance Portal._

## Realization
Identity taken from the verified token (never the client); version-stamped; quiz gate enforced before signing.

## Where it lives (code)
`apps/api/src/routes/signatures.js (POST /signatures)`

## Maturity
Production-grade

## Alternative SBBs that could realize this ABB
Any append-only store with identity binding.
