# SBB — in-process setInterval timers

_Solution Building Block realizing ABB **A10 Scheduling / Task Orchestration** in the Birgma Governance Portal._

## Realization
Simple for single-instance; SCHEDULERS_ENABLED lets exactly one replica run them when scaled out.

## Where it lives (code)
`apps/api/src/server.js (scheduleBackups/scheduleDaily)`

## Maturity
Single-instance (flag-gated); target: platform scheduler when scaling out

## Alternative SBBs that could realize this ABB
Cron container, platform cron job, Azure Functions Timer, job queue.
