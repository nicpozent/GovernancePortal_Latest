-- ============================================================
--  Migration 027 — IDEMPOTENT ACKNOWLEDGEMENT (finding #15)
--
--  The signing endpoint always inserted, so a double-click / retry / second tab
--  could record several signatures for the SAME content, inflating rollups that
--  count signature rows (percentages could exceed 100%).
--
--  Re-signing is only meaningful when there is NEW content to attest — i.e. a new
--  frozen revision (ADR-121). This partial unique index enforces AT MOST ONE
--  signature per (policy, user, revision), race-safely, while still allowing a
--  fresh acknowledgement once content changes (a new revision_id). It is
--  compatible with the append-only model (ADR-109): it constrains INSERTs only —
--  no UPDATE/DELETE is granted — so it prevents duplicates without permitting
--  tampering.
--
--  Legacy / link-only signatures (revision_id IS NULL) are not covered by this
--  index (NULLs are distinct); those are guarded by the application-level check.
--  Pre-existing duplicates, if any, are not removed here — the ledger is
--  append-only — so rollups also use count(distinct user) as belt-and-suspenders.
-- ============================================================
create unique index if not exists uq_signature_once_per_revision
  on signatures (policy_id, user_oid, revision_id)
  where revision_id is not null;
