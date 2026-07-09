-- ============================================================
--  Policy approval workflow — Phase 1 MVP (ADR-120).
--  Backward compatible: existing AND new policies default to
--  approval_state='published' / approved_externally=true, so nothing changes
--  until a policy is explicitly submitted for approval. Approval is opt-in.
-- ============================================================

alter table policies add column if not exists approval_state text not null default 'published'
  check (approval_state in ('draft','in_review','changes_requested','rejected','approved','published'));
alter table policies add column if not exists approved_externally boolean not null default true;
alter table policies add column if not exists approved_version text;
alter table policies add column if not exists submitted_at timestamptz;
alter table policies add column if not exists submitted_by uuid references employees(oid);

-- Ordered approver list per policy (MVP: one person per step, sequential).
create table if not exists policy_approvers (
  policy_id    uuid not null references policies(id) on delete cascade,
  position     int  not null,
  approver_oid uuid not null references employees(oid),
  primary key (policy_id, position)
);
create index if not exists idx_policy_approvers_oid on policy_approvers (approver_oid);

-- Append-only decision ledger (compliance evidence — like signatures/audit_log).
create table if not exists policy_approvals (
  id            bigserial primary key,
  policy_id     uuid not null references policies(id) on delete cascade,
  policy_version text not null,
  step_position int,
  approver_oid  uuid not null references employees(oid),
  decision      text not null check (decision in ('approved','rejected','changes_requested')),
  comment       text,
  decided_at    timestamptz not null default now()
);
create index if not exists idx_policy_approvals_policy on policy_approvals (policy_id, policy_version, decided_at);
