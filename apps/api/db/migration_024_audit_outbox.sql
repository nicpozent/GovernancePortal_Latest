-- ============================================================
--  Migration 024 — audit forwarding OUTBOX (#13)
--  External forwarding of audit/business events used to be fire-and-forget:
--  a process crash lost the event with no durable record. audit() now writes an
--  outbox row in the SAME statement path as the audit_log insert; a leader-locked
--  worker (drainOutbox) delivers pending rows to the configured SIEM with retry
--  and backoff, so delivery survives restarts.
--
--  Not append-only: the worker updates status/attempts, so no REVOKE here.
--  Grants come from docker-grants.sql (blanket grant, runs last).
-- ============================================================
create table if not exists audit_outbox (
  id              bigserial primary key,
  event           jsonb not null,
  status          text not null default 'pending',   -- pending | sent | skipped | failed
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Fast lookup of rows the worker should try next.
create index if not exists idx_audit_outbox_due on audit_outbox (next_attempt_at) where status = 'pending';
