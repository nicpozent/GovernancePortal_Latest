# SBB — nginx + helmet + express-rate-limit

_Solution Building Block realizing ABB **A3 Edge / API Gateway** in the Birgma Governance Portal._

## Realization
nginx serves SPA + proxies /api same-origin; CSP without unsafe-eval; per-route limiters incl. /feed.

## Where it lives (code)
`apps/web/nginx.conf, apps/api/src/app.js (helmet/rate-limit), apps/api/src/ratelimit.js`

## Maturity
Production-grade
