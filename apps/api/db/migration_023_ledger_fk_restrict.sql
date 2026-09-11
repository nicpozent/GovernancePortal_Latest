-- ============================================================
--  Migration 023 — protect the quiz attempt ledger (#8)
--  quiz_attempts is the append-only evidence of who passed a knowledge check.
--  Its quiz_id and policy_id foreign keys were ON DELETE CASCADE, so deleting a
--  quiz (reachable by a manager who owns the policy) — or a policy — would erase
--  the attempts. Referential actions run as the TABLE OWNER, so the app role's
--  REVOKE of DELETE on quiz_attempts does NOT stop a cascade.
--
--  Switch both FKs to ON DELETE RESTRICT so evidence cannot be destroyed via a
--  parent delete. Quizzes are retired via archived_at (soft-delete) instead; the
--  DELETE /quiz route now archives when attempts exist.
-- ============================================================
alter table quiz_attempts drop constraint if exists quiz_attempts_quiz_id_fkey;
alter table quiz_attempts
  add constraint quiz_attempts_quiz_id_fkey
  foreign key (quiz_id) references quizzes(id) on delete restrict;

alter table quiz_attempts drop constraint if exists quiz_attempts_policy_id_fkey;
alter table quiz_attempts
  add constraint quiz_attempts_policy_id_fkey
  foreign key (policy_id) references policies(id) on delete restrict;
