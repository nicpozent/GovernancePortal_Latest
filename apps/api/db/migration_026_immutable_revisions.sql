-- ============================================================
--  Migration 026 — IMMUTABLE CONTENT & QUIZ REVISIONS (ADR-121)
--
--  Closes external-review findings #4 and #9:
--   #4  A signature snapshotted only a free-text version LABEL; the content
--       behind it (the SharePoint pointer, or the replaceable upload) was
--       mutable in place, so an acknowledgement could later resolve to
--       different bytes — or to bytes that no longer existed.
--   #9  A quiz attempt was graded against a definition (quiz_questions) that
--       could be edited or deleted afterwards, so a past "pass" was neither
--       reproducible nor auditable.
--
--  Model (Decision A + 2a, signed off):
--   - policy_revisions: an APPEND-ONLY, content-addressed snapshot (sha256 of
--     the exact frozen bytes) of a policy's content at a moment in time. Bytes
--     are frozen LOCALLY for both uploads and SharePoint-hosted documents, so
--     an acknowledgement is self-contained and survives independently of the
--     source system (air-gap / DR friendly).
--   - signatures.revision_id binds each acknowledgement to the exact frozen
--     revision (FK ⇒ a referenced revision and its file can never be removed).
--   - policies.current_revision_id caches the live frozen revision so the sign
--     hot-path does not re-hash on every signature; it is cleared whenever the
--     content changes (a new revision is then frozen on the next acknowledgement).
--   - quiz_attempts.graded_against / definition_sha256 make every attempt
--     self-describing: a later quiz edit cannot change what a past pass meant.
--
--  Append-only integrity is enforced at the DB level, same as the other
--  ledgers (ADR-109) — see docker-grants.sql.
-- ============================================================

-- Immutable, content-addressed content snapshots ---------------
create table if not exists policy_revisions (
  id                  uuid primary key default gen_random_uuid(),
  policy_id           uuid not null references policies(id),
  version_label       text not null,                 -- the human version label at freeze time
  source              text not null                  -- where the frozen bytes came from
                        check (source in ('SharePoint','Upload')),
  -- Provenance of the content that was frozen (whichever applies):
  sharepoint_drive_id text,
  sharepoint_item_id  text,
  sharepoint_version  text,                           -- SharePoint's _UIVersionString at freeze
  upload_path         text,                           -- storage key of the FROZEN, never-overwritten file
  -- Content identity + how much we can attest to it:
  content_sha256      text,                           -- sha256 of the exact frozen bytes (null ⇒ legacy)
  content_size        bigint,
  content_mime        text,
  integrity           text not null default 'verified'
                        check (integrity in ('verified','legacy-unverified')),
  frozen_at           timestamptz not null default now(),
  frozen_by           uuid references employees(oid)
);
create index if not exists idx_policy_revisions_policy on policy_revisions (policy_id, frozen_at);
-- Content-addressed identity: one verified revision per (policy, exact bytes).
-- NULLs are distinct in Postgres, so legacy rows (content_sha256 is null) are
-- never collapsed together by this constraint.
create unique index if not exists uq_policy_revisions_content
  on policy_revisions (policy_id, content_sha256) where content_sha256 is not null;

-- Bind each acknowledgement to the exact frozen revision it attests to.
alter table signatures add column if not exists revision_id uuid references policy_revisions(id);
create index if not exists idx_sig_revision on signatures (revision_id);

-- Cache the live frozen revision so signing does not re-hash every time.
-- Cleared on content change (routes null it), re-frozen on the next signature.
alter table policies add column if not exists current_revision_id uuid references policy_revisions(id);

-- Make quiz attempts self-describing (reproducible independent of later edits).
alter table quiz_attempts add column if not exists graded_against jsonb;
alter table quiz_attempts add column if not exists definition_sha256 text;

-- ── Backfill: give every existing signature a (legacy, unverified) revision ──
-- We honestly cannot claim a content hash for historical acknowledgements —
-- the bytes may already have changed — so these are marked 'legacy-unverified'.
-- One revision per distinct (policy_id, policy_version) that has signatures;
-- existing signatures are then pointed at the matching row. New signatures from
-- here on freeze a real 'verified' revision. policies.current_revision_id is
-- deliberately left NULL so the next acknowledgement freezes fresh, verified
-- content rather than adopting an unverified legacy row.
insert into policy_revisions (policy_id, version_label, source, sharepoint_drive_id, sharepoint_item_id,
                              upload_path, content_mime, integrity)
select distinct s.policy_id, s.policy_version,
       case when p.source = 'Upload' then 'Upload' else 'SharePoint' end,
       p.sharepoint_drive_id, p.sharepoint_item_id, p.upload_path, p.upload_mime,
       'legacy-unverified'
  from signatures s
  join policies p on p.id = s.policy_id
 where s.revision_id is null
   and not exists (
     select 1 from policy_revisions r
      where r.policy_id = s.policy_id and r.version_label = s.policy_version
        and r.integrity = 'legacy-unverified');

update signatures s
   set revision_id = r.id
  from policy_revisions r
 where s.revision_id is null
   and r.policy_id = s.policy_id
   and r.version_label = s.policy_version
   and r.integrity = 'legacy-unverified';
