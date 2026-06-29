-- ============================================================
--  Migration 007 — ARCHIVE (soft-delete) groups
--  Archived groups drop out of the grid and stop contributing
--  to compliance, but keep their assignments/mappings so they
--  can be restored. Signatures are never affected by groups.
-- ============================================================
alter table groups add column if not exists archived_at timestamptz;
create index if not exists idx_groups_archived on groups (archived_at);
