-- ============================================================
--  Migration 011 — QUIZZES (knowledge checks per policy)
--  One quiz per policy. Admin sets per-question points and the
--  pass threshold. Employees take it after reading; attempts are
--  recorded (append-only); signing is gated on passing.
-- ============================================================
create table if not exists quizzes (
  id          uuid primary key default gen_random_uuid(),
  policy_id   uuid not null unique references policies(id) on delete cascade,
  title       text not null default 'Knowledge check',
  pass_pct    int  not null default 80,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references quizzes(id) on delete cascade,
  position      int  not null default 0,
  prompt        text not null,
  options       jsonb not null default '[]',     -- array of answer strings
  correct_index int  not null default 0,
  points        int  not null default 1
);
create index if not exists idx_qq_quiz on quiz_questions (quiz_id);

-- Append-only attempt ledger.
create table if not exists quiz_attempts (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references quizzes(id) on delete cascade,
  policy_id  uuid not null references policies(id) on delete cascade,
  user_oid   uuid not null references employees(oid),
  attempt_no int  not null,
  score      int  not null,
  max_score  int  not null,
  pct        int  not null,
  passed     boolean not null,
  answers    jsonb,
  at         timestamptz not null default now()
);
create index if not exists idx_qa_user on quiz_attempts (user_oid, policy_id);

grant select, insert, update, delete on quizzes, quiz_questions to governance_app;
grant select, insert on quiz_attempts to governance_app;
revoke update, delete on quiz_attempts from governance_app;
