// Generated from the former monolithic routes.js — handler bodies are verbatim.
const { pool } = require('../db');
const cfg = require('../config');
const { requireManager } = require('../auth');
const { isAdmin, audit, canManage, canRead } = require('../authz');

module.exports = (r) => {
// ── QUIZZES (knowledge checks) ───────────────────────────────
// Get the quiz for a policy. Admin sees correct answers + points;
// employees get the questions only, plus their own attempt history.
r.get('/policies/:id/quiz', async (req, res) => {
  const admin = isAdmin(req) || (await canManage(req, req.params.id));
  if (!admin && !(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const quiz = (await pool.query('select * from quizzes where policy_id = $1', [req.params.id])).rows[0];
  if (!quiz) return res.json({ quiz: null });
  if (!admin && quiz.archived_at) return res.json({ quiz: null });   // archived → no gate for employees
  const qs = (await pool.query('select * from quiz_questions where quiz_id = $1 order by position, id', [quiz.id])).rows;
  const questions = qs.map((q) => admin
    ? { id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correct_index, points: q.points }
    : { id: q.id, prompt: q.prompt, options: q.options, points: q.points });
  let attempts = [];
  if (!admin) {
    attempts = (await pool.query(
      'select attempt_no, score, max_score, pct, passed, at from quiz_attempts where policy_id = $1 and user_oid = $2 order by attempt_no',
      [req.params.id, req.user.oid])).rows;
  }
  res.json({ quiz: { id: quiz.id, title: quiz.title, passPct: quiz.pass_pct, archived: !!quiz.archived_at }, questions, attempts, attemptsUsed: attempts.length, maxAttempts: cfg.quizMaxAttempts, passed: attempts.some((a) => a.passed) });
});

// Create or replace the quiz for a policy (admin, or manager who owns it).
r.post('/policies/:id/quiz', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const { title, passPct, questions } = req.body || {};
  if (!Array.isArray(questions) || !questions.length) return res.status(400).json({ error: 'no_questions' });
  // One transaction: upsert the quiz, clear its old questions and insert the new
  // set together — a failure mid-way must not leave the quiz with zero / partial
  // questions.
  const client = await pool.connect();
  let quiz, pos = 0;
  try {
    await client.query('begin');
    quiz = (await client.query(
      `insert into quizzes (policy_id, title, pass_pct) values ($1, $2, $3)
       on conflict (policy_id) do update set title = excluded.title, pass_pct = excluded.pass_pct, archived_at = null, updated_at = now()
       returning *`,
      [req.params.id, (title || 'Knowledge check').trim(), Math.min(100, Math.max(1, parseInt(passPct, 10) || 80))])).rows[0];
    await client.query('delete from quiz_questions where quiz_id = $1', [quiz.id]);
    for (const q of questions) {
      const opts = Array.isArray(q.options) ? q.options.filter((o) => String(o).trim().length) : [];
      if (!q.prompt || !q.prompt.trim() || opts.length < 2) continue;
      await client.query(
        `insert into quiz_questions (quiz_id, position, prompt, options, correct_index, points)
         values ($1,$2,$3,$4,$5,$6)`,
        [quiz.id, pos++, q.prompt.trim(), JSON.stringify(opts), Math.min(opts.length - 1, Math.max(0, parseInt(q.correctIndex, 10) || 0)), Math.max(1, parseInt(q.points, 10) || 1)]);
    }
    await client.query('commit');
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    if (req.log) req.log.error({ err: e.message }, 'quiz save failed');
    return res.status(500).json({ error: 'server_error' });
  } finally { client.release(); }
  await audit(req, 'quiz.save', req.params.id, { questions: pos, passPct: quiz.pass_pct });
  res.status(201).json({ ok: true, questions: pos });
});

// Archive / restore the quiz for a policy (admin).
r.post('/policies/:id/quiz/archive', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  await pool.query('update quizzes set archived_at = now() where policy_id = $1', [req.params.id]);
  await audit(req, 'quiz.archive', req.params.id);
  res.status(204).end();
});

r.post('/policies/:id/quiz/restore', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  await pool.query('update quizzes set archived_at = null where policy_id = $1', [req.params.id]);
  await audit(req, 'quiz.restore', req.params.id);
  res.status(204).end();
});

// Delete the quiz for a policy (admin, or manager who owns it).
// If the quiz has recorded attempts, those are tamper-evident compliance
// evidence (append-only quiz_attempts), so we ARCHIVE the quiz instead of
// hard-deleting it — a hard delete would cascade the attempt ledger away.
// A never-attempted quiz has no evidence to protect and is removed outright.
r.delete('/policies/:id/quiz', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const quiz = (await pool.query('select id from quizzes where policy_id = $1', [req.params.id])).rows[0];
  if (!quiz) return res.status(204).end();
  const hasAttempts = (await pool.query('select 1 from quiz_attempts where quiz_id = $1 limit 1', [quiz.id])).rowCount > 0;
  if (hasAttempts) {
    await pool.query('update quizzes set archived_at = now() where policy_id = $1', [req.params.id]);
    await audit(req, 'quiz.delete', req.params.id, { archived: true, reason: 'has_attempts' });
    return res.status(200).json({ ok: true, archived: true, detail: 'This quiz has recorded attempts and was archived to preserve the evidence ledger instead of being deleted.' });
  }
  await pool.query('delete from quizzes where policy_id = $1', [req.params.id]);
  await audit(req, 'quiz.delete', req.params.id, { deleted: true });
  res.status(204).end();
});

// Submit a quiz attempt (employee) — graded server-side.
r.post('/policies/:id/quiz/attempt', async (req, res) => {
  if (!(await canRead(req, req.params.id))) return res.status(403).json({ error: 'forbidden', detail: 'not assigned to you' });
  const answers = (req.body && req.body.answers) || {};
  const quiz = (await pool.query('select * from quizzes where policy_id = $1 and archived_at is null', [req.params.id])).rows[0];
  if (!quiz) return res.status(404).json({ error: 'no_quiz' });

  // Grading is a pure read of the question set — do it before the lock.
  const qs = (await pool.query('select id, prompt, correct_index, points from quiz_questions where quiz_id = $1', [quiz.id])).rows;
  let score = 0, max = 0; const review = [];
  for (const q of qs) {
    max += q.points;
    const chosen = Number(answers[q.id]);
    const correct = chosen === q.correct_index;
    if (correct) score += q.points;
    review.push({ id: q.id, prompt: q.prompt, chosen: isNaN(chosen) ? null : chosen, correctIndex: q.correct_index, correct, points: q.points });
  }
  const pct = max ? Math.round((score / max) * 100) : 0;
  const passed = pct >= quiz.pass_pct;

  // The "already-passed / attempts-left" check and the insert must be atomic,
  // or concurrent submissions could exceed the cap. Serialize per (user, policy)
  // with a transaction-scoped advisory lock.
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${req.user.oid}:${req.params.id}`]);
    const prior = (await client.query(
      'select attempt_no, passed from quiz_attempts where policy_id = $1 and user_oid = $2 order by attempt_no',
      [req.params.id, req.user.oid])).rows;
    if (prior.some((a) => a.passed)) { await client.query('rollback'); return res.status(409).json({ error: 'already_passed' }); }
    if (prior.length >= cfg.quizMaxAttempts) { await client.query('rollback'); return res.status(403).json({ error: 'no_attempts_left', detail: 'No attempts remaining. Contact your administrator.' }); }
    const attemptNo = prior.length + 1;
    await client.query(
      `insert into quiz_attempts (quiz_id, policy_id, user_oid, attempt_no, score, max_score, pct, passed, answers)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [quiz.id, req.params.id, req.user.oid, attemptNo, score, max, pct, passed, JSON.stringify(answers)]);
    await client.query('commit');
    await audit(req, 'quiz.attempt', req.params.id, { attemptNo, pct, passed });
    res.json({ score, maxScore: max, pct, passed, attemptNo, remaining: Math.max(0, cfg.quizMaxAttempts - attemptNo), passPct: quiz.pass_pct, review });
  } catch (e) {
    try { await client.query('rollback'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
});

// Quiz analytics for admins — attempts, pass rate, per-question difficulty.
r.get('/policies/:id/quiz/analytics', requireManager, async (req, res) => {
  if (!(await canManage(req, req.params.id))) return res.status(403).json({ error: 'forbidden' });
  const quiz = (await pool.query('select * from quizzes where policy_id = $1', [req.params.id])).rows[0];
  if (!quiz) return res.json({ quiz: null });
  const att = (await pool.query(
    `select count(*)::int as attempts, count(distinct user_oid)::int as people,
            count(*) filter (where passed)::int as passes,
            count(distinct user_oid) filter (where passed)::int as people_passed,
            round(avg(pct))::int as avg_pct
       from quiz_attempts where policy_id = $1`, [req.params.id])).rows[0];
  const qs = (await pool.query('select id, prompt, points, correct_index from quiz_questions where quiz_id = $1 order by position, id', [quiz.id])).rows;
  // per-question correct rate across all attempts
  const attempts = (await pool.query('select answers from quiz_attempts where policy_id = $1', [req.params.id])).rows;
  const perQ = qs.map((q) => {
    let correct = 0, answered = 0;
    for (const a of attempts) { const v = a.answers && a.answers[q.id]; if (v !== undefined && v !== null) { answered++; if (Number(v) === q.correct_index) correct++; } }
    return { prompt: q.prompt, points: q.points, answered, correct, rate: answered ? Math.round(correct / answered * 100) : null };
  });
  res.json({ quiz: { title: quiz.title, passPct: quiz.pass_pct }, summary: att, questions: perQ });
});
};
