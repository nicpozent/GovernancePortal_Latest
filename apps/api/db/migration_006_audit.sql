-- ============================================================
--  Migration 006 — ADMIN AUDIT LOG
--  Records who did what (policy create/edit/archive, group
--  changes, mappings, membership, sync). Complements the
--  append-only signature ledger.
-- ============================================================
create table if not exists audit_log (
  id         bigserial primary key,
  actor_oid  uuid,
  actor_name text,
  action     text not null,          -- e.g. 'policy.create', 'group.member.add'
  target     text,                   -- human-readable target (name / id)
  detail     jsonb,                  -- optional structured context
  ip         inet,
  at         timestamptz not null default now()
);
create index if not exists idx_audit_at on audit_log (at desc);

-- The app role can append and read audit rows (no update/delete — append-only).
grant select, insert on audit_log to governance_app;
grant usage, select on sequence audit_log_id_seq to governance_app;
revoke update, delete on audit_log from governance_app;
