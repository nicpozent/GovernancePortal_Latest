-- ============================================================
--  Migration 009 — signature deadline per policy
--  due_date = the date by which required employees must sign.
--  Drives the "Overdue" / "Due soon" status and (later) reminders.
-- ============================================================
alter table policies add column if not exists due_date date;
