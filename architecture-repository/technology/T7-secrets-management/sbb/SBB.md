# SBB — .env on disk now → Azure Key Vault + Managed Identity (target)

_Solution Building Block realizing ABB **T7 Secrets Management** in the Birgma Governance Portal._

## Realization
Code already supports DefaultAzureCredential (no stored secret); on-prem uses .env (gitignored).

## Where it lives (code)
`apps/api/src/graph.js, apps/api/src/config.js`

## Maturity
Weak (secrets on disk); target: Key Vault + Managed Identity
