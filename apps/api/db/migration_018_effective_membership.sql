-- ============================================================
--  Migration 018 — single source of truth for effective membership
--
--  "Effective membership" = direct membership of a (non-archived) group
--  UNION the rolled-up membership of directory groups mapped into a
--  (non-archived) group. This expression was previously inlined as a CTE in
--  ~11 queries (dashboards, reports, reminders, canRead, the employee policy
--  list). One copy diverging is exactly what caused review finding M-1, so it
--  now lives in ONE place and every query selects from this view.
--
--  Columns: (group_id, employee_oid). Set semantics (UNION dedups), matching
--  the inlined CTEs it replaces — so substituting it is behaviour-preserving.
-- ============================================================
create or replace view effective_group_membership as
    select eg.group_id, eg.employee_oid
      from employee_groups eg
      join groups g on g.id = eg.group_id and g.archived_at is null
  union
    select gem.group_id, gem.employee_oid
      from group_effective_members gem
      join groups g on g.id = gem.group_id and g.archived_at is null;

-- Read-only for the least-privilege app role (covered by the blanket grant in
-- docker-grants.sql too, but explicit here so the migration is self-contained
-- when applied to an already-initialised database).
grant select on effective_group_membership to governance_app;
