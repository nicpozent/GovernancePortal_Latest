-- ============================================================
--  Migration 016 — trainings (manager-owned, locally uploaded)
--  A training reuses the policies table with doc_type='Training'
--  and a locally-uploaded file (no SharePoint). These columns
--  hold the stored file reference.
-- ============================================================
alter table policies add column if not exists upload_path text;   -- server path under /uploads
alter table policies add column if not exists upload_name text;   -- original filename
alter table policies add column if not exists upload_mime text;   -- content type
alter table policies add column if not exists source text;        -- 'Upload' for trainings, null for SharePoint policies

-- Allow the 'Training' document type.
alter table policies drop constraint if exists policies_doc_type_check;
alter table policies add constraint policies_doc_type_check
  check (doc_type in ('Policy','Process','Procedure','Standard','Guideline','Training'));
