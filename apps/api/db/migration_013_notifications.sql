-- ============================================================
--  Migration 013 — email reminder ledger (idempotency)
--  One row per reminder actually sent, so each milestone fires
--  once per policy version per user.
-- ============================================================
create table if not exists notifications_sent (
  id             bigserial primary key,
  policy_id      uuid not null references policies(id) on delete cascade,
  user_oid       uuid not null references employees(oid) on delete cascade,
  milestone      text not null,        -- 'assigned' | 'due-20' | 'due-15' | 'due-7' | 'due-1' | 'overdue'
  policy_version text,
  sent_at        timestamptz not null default now(),
  unique (policy_id, user_oid, milestone, policy_version)
);
create index if not exists idx_notif_policy on notifications_sent (policy_id, user_oid);

grant select, insert on notifications_sent to governance_app;
grant usage, select on sequence notifications_sent_id_seq to governance_app;
