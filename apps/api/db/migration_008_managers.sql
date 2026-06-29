-- ============================================================
--  Migration 008 — manager fields
--  manager_name / manager_email  = the legal/local manager,
--    populated from the directory (AD/Entra) on sync.
--  functional_manager_oid        = the real reporting manager,
--    set inside the platform (overrides for cross-entity cases).
-- ============================================================
alter table employees add column if not exists manager_name text;
alter table employees add column if not exists manager_email text;
alter table employees add column if not exists functional_manager_oid uuid references employees(oid);
create index if not exists idx_emp_funcmgr on employees (functional_manager_oid);
