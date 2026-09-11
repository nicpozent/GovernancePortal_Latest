-- ============================================================
--  Migration 025 — allow approver redaction on GDPR erasure (#20)
--  policy_approvals is an append-only decision ledger whose approver_oid was
--  NOT NULL — so erasing an employee who had ever approved/rejected a policy
--  failed the erasure transaction on the FK. Make approver_oid NULLABLE so an
--  Art. 17 erasure can REDACT the approver (null the identity) while keeping the
--  decision, comment and timestamp — exactly how the audit trail is pseudonymised.
--  (PK is `id`, so dropping NOT NULL here is safe.)
-- ============================================================
alter table policy_approvals alter column approver_oid drop not null;
