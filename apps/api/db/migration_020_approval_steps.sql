-- ============================================================
--  Policy approval workflow — Phase 2b: group approvers (ADR-120).
--  A "step" may now hold MORE THAN ONE approver, with a rule for when
--  the step is satisfied:
--    all    — every approver in the step must approve (default)
--    any    — a single approval clears the step
--    quorum — at least `required` of the approvers must approve
--  Backward compatible: a step with one approver + rule 'all' behaves exactly
--  like the Phase 1 sequential chain, and a missing rule row defaults to 'all'.
-- ============================================================

-- Allow multiple approvers to share a position (a step group): widen the PK.
alter table policy_approvers drop constraint if exists policy_approvers_pkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'policy_approvers_pkey') then
    alter table policy_approvers add constraint policy_approvers_pkey primary key (policy_id, position, approver_oid);
  end if;
end $$;

-- Per-step rule. Absent row => rule 'all' (i.e. everyone in the step).
create table if not exists policy_approval_steps (
  policy_id uuid not null references policies(id) on delete cascade,
  position  int  not null,
  rule      text not null default 'all' check (rule in ('all','any','quorum')),
  required  int,
  primary key (policy_id, position)
);
