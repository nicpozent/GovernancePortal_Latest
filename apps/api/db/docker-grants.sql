-- ============================================================
--  Grants for the least-privilege app role (runs LAST on init,
--  after schema.sql + every migration). This file is the single
--  final authority on what governance_app may do.
--  Tables are owned by the superuser; governance_app only gets
--  what it needs. The append-only REVOKEs below are last, so they
--  can't be re-granted by an earlier blanket grant.
-- ============================================================

grant usage on schema public to governance_app;

grant select, insert, update, delete
  on all tables in schema public
  to governance_app;

-- Sequences (e.g. audit_log_id_seq from bigserial) need usage for inserts.
grant usage, select on all sequences in schema public to governance_app;

-- Read-only authorization / rollup views.
grant select on platform_group_members, admin_users, group_effective_members, effective_group_membership to governance_app;

-- ── Append-only ledgers: corrections are new rows, never edits/removals ──
revoke update, delete on signatures    from governance_app;
revoke update, delete on audit_log     from governance_app;
revoke update, delete on quiz_attempts from governance_app;
revoke update, delete on policy_approvals from governance_app;
-- Frozen content snapshots are immutable evidence (ADR-121): a revision, once
-- frozen, is never edited or removed while any signature references it.
revoke update, delete on policy_revisions from governance_app;
