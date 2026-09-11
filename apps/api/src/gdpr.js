// ============================================================
//  GDPR data-subject operations (Art. 15 export, Art. 17 erasure, retention).
//
//  Split by privilege on purpose:
//   - collectSubject()  is READ-ONLY and safe for the app role — it backs the
//     admin DSAR export endpoint.
//   - eraseSubject() and purgeRetention() DELETE ledger rows, which the app role
//     is deliberately REVOKE'd from doing (docker-grants.sql). They therefore run
//     ONLY via the privileged CLI (db/gdpr.js, ADMIN_DATABASE_URL) — the running
//     application can never erase the compliance record, but an authorised DBA
//     can, under the documented process (docs/GDPR-DATA-RIGHTS.md).
//
//  collectSubject() may take a Pool (its queries are independent). eraseSubject()
//  and purgeRetention() are transactional (BEGIN/COMMIT) and MUST be given a
//  single dedicated connection (a pg Client, or pool.connect()) — a Pool would
//  run BEGIN and the DELETEs on different connections. The CLI passes a Client.
// ============================================================

// ---- Art. 15 / 20: everything we hold about one data subject (read-only) ----
async function collectSubject(db, oid) {
  // Sequential (not Promise.all): this must work when `db` is a single pg Client
  // (the CLI) as well as a Pool — a Client can only run one query at a time.
  const q = (sql) => db.query(sql, [oid]).then((r) => r.rows);
  const [employee] = await q('select * from employees where oid = $1');
  const memberships = await q(`select g.id, g.name, g.kind from employee_groups eg join groups g on g.id = eg.group_id
        where eg.employee_oid = $1 order by g.name`);
  const signatures = await q(`select policy_id, policy_version, full_name, acknowledged, signed_at, ip_address, user_agent
        from signatures where user_oid = $1 order by signed_at`);
  const quizAttempts = await q(`select policy_id, quiz_id, attempt_no, score, max_score, pct, passed, answers, at
        from quiz_attempts where user_oid = $1 order by at`);
  const notifications = await q('select policy_id, milestone, policy_version, sent_at from notifications_sent where user_oid = $1 order by sent_at');
  // Approval decisions the subject made (they are the approver).
  const approvalsMade = await q(`select policy_id, policy_version, step_position, decision, comment, decided_at
        from policy_approvals where approver_oid = $1 order by decided_at`);
  // The subject's OWN actions in the audit log (not actions others took).
  const auditActions = await q('select at, action, target, ip from audit_log where actor_oid = $1 order by at');
  return {
    subjectOid: oid,
    generatedAt: new Date().toISOString(),
    found: !!employee,
    employee: employee || null,
    groupMemberships: memberships,
    signatures,
    quizAttempts,
    notifications,
    approvalsMade,
    auditActions,
    counts: {
      signatures: signatures.length,
      quizAttempts: quizAttempts.length,
      notifications: notifications.length,
      groupMemberships: memberships.length,
      approvalsMade: approvalsMade.length,
      auditActions: auditActions.length,
    },
  };
}

// ---- Art. 17: lawful erasure of one subject (PRIVILEGED; transactional) ----
// Deletes the subject's personal records and their identity from the directory,
// and PSEUDONYMISES (not deletes) their rows in the admin audit trail so the
// record of what happened to the account survives. Returns per-table counts.
// Runs in a single transaction — either the whole erasure applies or none of it.
async function eraseSubject(db, oid) {
  await db.query('begin');
  try {
    const n = {};
    const del = async (key, sql) => { n[key] = (await db.query(sql, [oid])).rowCount; };
    // Detach FKs that would block deleting the employee row.
    await db.query('update employees set functional_manager_oid = null where functional_manager_oid = $1', [oid]);
    await db.query("update policies set owner_oid = null, owner = '[erased]' where owner_oid = $1", [oid]);
    await db.query('update policies set submitted_by = null where submitted_by = $1', [oid]);
    await db.query('update approval_workflows set created_by = null where created_by = $1', [oid]);
    // Redact the subject from the append-only APPROVAL DECISION ledger: keep the
    // decision/comment/timestamp (compliance evidence), null the approver identity.
    n.approvalsRedacted = (await db.query('update policy_approvals set approver_oid = null where approver_oid = $1', [oid])).rowCount;
    // Pseudonymise the subject's own audit entries (keep the event, drop the identity incl. IP).
    n.auditPseudonymised = (await db.query(
      "update audit_log set actor_oid = null, actor_name = '[erased]', ip = null where actor_oid = $1", [oid])).rowCount;
    // Delete the personal records — incl. workflow CONFIG rows naming the subject
    // as a configured approver (config, not evidence).
    await del('policyApprovers', 'delete from policy_approvers where approver_oid = $1');
    await del('workflowStepApprovers', 'delete from approval_workflow_step_approvers where approver_oid = $1');
    await del('signatures', 'delete from signatures where user_oid = $1');
    await del('quizAttempts', 'delete from quiz_attempts where user_oid = $1');
    await del('notifications', 'delete from notifications_sent where user_oid = $1');
    await del('groupMemberships', 'delete from employee_groups where employee_oid = $1');
    await del('employee', 'delete from employees where oid = $1');
    await db.query('commit');
    return n;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

// ---- Retention: purge records older than a cutoff (PRIVILEGED; transactional) ----
// cutoff is a Date; rows strictly older than it are removed. Returns counts.
async function purgeRetention(db, cutoff) {
  const iso = cutoff.toISOString();
  await db.query('begin');
  try {
    const n = {};
    const del = async (key, sql) => { n[key] = (await db.query(sql, [iso])).rowCount; };
    await del('signatures', 'delete from signatures where signed_at < $1');
    await del('quizAttempts', 'delete from quiz_attempts where at < $1');
    await del('notifications', 'delete from notifications_sent where sent_at < $1');
    await del('approvals', 'delete from policy_approvals where decided_at < $1');
    await del('auditLog', 'delete from audit_log where at < $1');
    await db.query('commit');
    return n;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

module.exports = { collectSubject, eraseSubject, purgeRetention };
