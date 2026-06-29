-- ============================================================
--  Migration 010 — rolling signature deadline
--  due_days = sign within N days of becoming required (fair to
--  new joiners). Used when due_date (absolute) is not set.
--  Per-employee deadline = greatest(policy.created_at,
--    employee.created_at) + due_days.
-- ============================================================
alter table policies add column if not exists due_days integer;
