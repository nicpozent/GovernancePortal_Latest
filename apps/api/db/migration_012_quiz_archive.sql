-- ============================================================
--  Migration 012 — archive quizzes (soft-delete)
--  Archived quizzes stop gating signing and disappear from the
--  employee flow, but are kept and can be restored or edited.
-- ============================================================
alter table quizzes add column if not exists archived_at timestamptz;
