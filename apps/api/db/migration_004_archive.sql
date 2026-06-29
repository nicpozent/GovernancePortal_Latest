-- ============================================================
--  Migration 004 — ARCHIVE (soft-delete) policies
--  Hides a policy in the app without touching the append-only
--  signature ledger (which the app role cannot DELETE anyway).
-- ============================================================
alter table policies add column if not exists archived_at timestamptz;
create index if not exists idx_policies_archived on policies (archived_at);
