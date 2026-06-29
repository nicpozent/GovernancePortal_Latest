# SBB — reminder engine (assigned/20/15/7/1-day/overdue)

_Solution Building Block realizing ABB **B6 Notification & Escalation** in the Birgma Governance Portal._

## Realization
Idempotent per (policy,user,version,milestone); only group-assigned obligations notified (M-1 fix).

## Where it lives (code)
`apps/api/src/services/reminders.js`

## Maturity
Production-grade
