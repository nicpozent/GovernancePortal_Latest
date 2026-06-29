-- ============================================================
--  Migration 015 — policy owner mapped to a platform user
--  owner_oid references an employee; the text `owner` is kept
--  as a display fallback. Defaults to the uploader on create.
-- ============================================================
alter table policies add column if not exists owner_oid uuid references employees(oid);
create index if not exists idx_policies_owner on policies (owner_oid);
