-- ============================================================
--  Policy approval workflow — Phase 2c: reusable templates (ADR-120).
--  A template is a named, ordered approval chain (steps with all/any/quorum
--  rules and person approvers) that an admin defines once and applies to many
--  policies. APPLYING a template COPIES its steps into the policy's existing
--  policy_approvers / policy_approval_steps — so the policy carries its own
--  snapshot and later template edits never disturb an in-flight or already
--  configured policy. Templates are authoring convenience only; the per-policy
--  config remains the single source of truth for a run.
-- ============================================================

create table if not exists approval_workflows (
  id          bigserial primary key,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_by  uuid references employees(oid),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists approval_workflow_steps (
  workflow_id bigint not null references approval_workflows(id) on delete cascade,
  position    int  not null,
  rule        text not null default 'all' check (rule in ('all','any','quorum')),
  required    int,
  primary key (workflow_id, position)
);

create table if not exists approval_workflow_step_approvers (
  workflow_id  bigint not null,
  position     int  not null,
  approver_oid uuid not null references employees(oid),
  primary key (workflow_id, position, approver_oid),
  foreign key (workflow_id, position) references approval_workflow_steps(workflow_id, position) on delete cascade
);
