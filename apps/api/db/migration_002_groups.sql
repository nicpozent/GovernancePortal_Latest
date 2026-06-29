-- ============================================================
--  Migration 002 — first-class, many-to-many GROUPS
--  Lets you create groups (Entra-synced or Local), put a person
--  in several, and assign each policy to specific groups only.
--  Run AFTER schema.sql:  psql "$DATABASE_URL" -f db/migration_002_groups.sql
-- ============================================================

create table if not exists groups (
  id             uuid primary key default gen_random_uuid(),
  entra_group_id uuid unique,                 -- set for Entra security groups; null for Local groups
  name           text not null unique,        -- displayName; keep unique across sources
  description    text,
  source         text not null default 'Entra ID'
                  check (source in ('Entra ID','Local')),
  created_at     timestamptz not null default now()
);

-- many-to-many: a person can be in many groups
create table if not exists employee_groups (
  employee_oid uuid not null references employees(oid) on delete cascade,
  group_id     uuid not null references groups(id) on delete cascade,
  primary key (employee_oid, group_id)
);

-- a policy is assigned to one or more groups (only members see/sign it)
create table if not exists policy_groups (
  policy_id uuid not null references policies(id) on delete cascade,
  group_id  uuid not null references groups(id) on delete cascade,
  primary key (policy_id, group_id)
);

create index if not exists idx_eg_group on employee_groups (group_id);
create index if not exists idx_pg_group on policy_groups (group_id);

-- ── Backfill from the simple department/role model ───────────
-- 1) one group per distinct department seen so far
insert into groups (name, source)
  select distinct department, 'Local' from employees
  where department is not null and department <> 'Unassigned'
  on conflict (name) do nothing;

-- 2) membership from each employee's department
insert into employee_groups (employee_oid, group_id)
  select e.oid, g.id from employees e join groups g on g.name = e.department
  on conflict do nothing;

-- 3) policy assignment from the old string-based policy_roles
insert into policy_groups (policy_id, group_id)
  select pr.policy_id, g.id from policy_roles pr join groups g on g.name = pr.role
  on conflict do nothing;

-- policy_roles is now legacy; policy_groups + employee_groups are authoritative.
