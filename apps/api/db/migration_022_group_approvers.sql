-- ============================================================
--  Policy approval workflow — Phase 2d: directory-group approvers (ADR-120).
--  A step may reference a GROUP as well as (or instead of) named people. The
--  group is resolved to its current members at SUBMIT time and those members
--  are frozen into policy_approvers for the run (snapshot-at-submit), so a
--  membership change mid-review never shifts an in-flight run and the
--  append-only decision ledger stays meaningful. Person approvers are
--  unchanged — a step with only named people behaves exactly as before.
-- ============================================================

-- Mark approver rows that were EXPANDED from a group at submit, so they can be
-- cleared and re-resolved on each new run. NULL = a directly-named approver.
alter table policy_approvers add column if not exists from_group uuid references groups(id) on delete set null;

-- Group entries in a policy's step spec (named people still live in
-- policy_approvers; groups here are expanded into it at submit).
create table if not exists policy_approver_groups (
  policy_id uuid not null references policies(id) on delete cascade,
  position  int  not null,
  group_id  uuid not null references groups(id) on delete cascade,
  primary key (policy_id, position, group_id)
);

-- Group entries in a reusable template step (Phase 2c).
create table if not exists approval_workflow_step_groups (
  workflow_id bigint not null,
  position    int  not null,
  group_id    uuid not null references groups(id) on delete cascade,
  primary key (workflow_id, position, group_id),
  foreign key (workflow_id, position) references approval_workflow_steps(workflow_id, position) on delete cascade
);
