# SBB — notifications_sent table

_Solution Building Block realizing ABB **D6 Notification State Store** in the Birgma Governance Portal._

## Realization
Unique key per (policy,user,version,milestone); insert-on-conflict-do-nothing makes reminders idempotent.

## Where it lives (code)
`apps/api/db/migration_013_notifications.sql`

## Maturity
Production-grade
