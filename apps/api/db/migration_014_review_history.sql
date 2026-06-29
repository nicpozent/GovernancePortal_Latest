-- ============================================================
--  Migration 014 — review dates, version history, leaver stamp
-- ============================================================

-- Policy "review by" date + who owns the review reminder milestone.
alter table policies add column if not exists review_date date;

-- When an employee was last marked inactive (leaver), for the audit view.
alter table employees add column if not exists deactivated_at timestamptz;

-- Visible version history / change log for a policy.
create table if not exists policy_versions (
  id          bigserial primary key,
  policy_id   uuid not null references policies(id) on delete cascade,
  version     text not null,
  note        text,
  changed_by  text,
  changed_at  timestamptz not null default now()
);
create index if not exists idx_polver_policy on policy_versions (policy_id, changed_at desc);

-- Reminder milestone for policy review (idempotency handled in notifications_sent
-- via milestone='review' with the review date encoded in policy_version slot).

grant select, insert on policy_versions to governance_app;
grant usage, select on sequence policy_versions_id_seq to governance_app;
