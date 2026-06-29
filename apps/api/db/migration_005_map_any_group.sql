-- ============================================================
--  Migration 005 — map directory groups into ANY portal group
--  Previously only Platform groups could have directory groups
--  mapped in. group_mappings already references groups(id) for
--  both sides, so Local groups work too — we just need a general
--  effective-membership view that isn't restricted to kind='Platform'.
-- ============================================================

-- Rolled-up membership for ANY target group (Platform or Local) that
-- has one or more directory (AD / Entra) groups mapped into it.
create or replace view group_effective_members as
  select distinct gm.platform_group_id as group_id, eg.employee_oid
    from group_mappings gm
    join employee_groups eg on eg.group_id = gm.ad_group_id;
