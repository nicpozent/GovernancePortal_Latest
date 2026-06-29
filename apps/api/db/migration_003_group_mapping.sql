-- ============================================================
--  Migration 003 — PLATFORM GROUPS + AD→platform mapping
--  Platform groups are internal authorization roles. You IMPORT
--  Active Directory / Entra security groups (kind='Directory',
--  created by sync) and MAP them into platform groups; members
--  roll up automatically.
--  Run AFTER migration_002_groups.sql:
--    psql "$DATABASE_URL" -f db/migration_003_group_mapping.sql
-- ============================================================

-- Distinguish internal platform groups from imported directory groups.
alter table groups add column if not exists kind text not null default 'Directory'
  check (kind in ('Platform','Directory','Local'));
-- 'Platform'  = internal role group (Administrators, Compliance, Read All, …)
-- 'Directory' = imported AD / Entra security group
-- 'Local'     = ad-hoc portal group

-- Members of an imported AD group roll up into a platform group.
create table if not exists group_mappings (
  ad_group_id       uuid not null references groups(id) on delete cascade,
  platform_group_id uuid not null references groups(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (ad_group_id, platform_group_id)
);

-- The three created platform groups (no members, no mappings prefilled).
insert into groups (name, description, source, kind) values
  ('Administrators','Full administration of the governance platform','Local','Platform'),
  ('Compliance','Manage policies and view organisation-wide compliance','Local','Platform'),
  ('Read All','Read access to all published policies','Local','Platform')
on conflict (name) do update set kind = 'Platform', description = excluded.description;

-- Effective membership of each platform group (via mapped directory groups).
create or replace view platform_group_members as
  select distinct pg.id as platform_group_id, pg.name as platform_group, eg.employee_oid
    from groups pg
    join group_mappings gm on gm.platform_group_id = pg.id
    join employee_groups eg on eg.group_id = gm.ad_group_id
   where pg.kind = 'Platform';

-- Admin is granted by membership of the 'Administrators' platform group.
-- (Alternative / supplement to the Governance.Admin Entra App Role.)
create or replace view admin_users as
  select employee_oid from platform_group_members where platform_group = 'Administrators';
