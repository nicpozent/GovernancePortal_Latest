# SBB — in-process setInterval + Postgres advisory-lock leader election

_Solution Building Block realizing ABB **A10 Scheduling / Task Orchestration** in the Birgma Governance Portal._

## Realization
Recurring jobs run in-process; a Postgres advisory lock (withLeaderLock) ensures exactly one replica runs them when scaled out.

## Where it lives (code)
`apps/api/src/leader.js, apps/api/src/server.js (scheduleBackups/scheduleDaily)`

## Maturity
Production-grade (advisory-lock leader election; ADR-119)

## Alternative SBBs that could realize this ABB
Cron container, platform cron job, Azure Functions Timer, job queue.
