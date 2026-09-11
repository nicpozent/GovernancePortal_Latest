# Immutable content & quiz revisions — design & decision record

**Status: Accepted & implemented (ADR-121).** Both §6 decisions were signed off:
**Decision 1 = Option A** (every content change freezes a new immutable revision
and raises a new acknowledgement obligation; old revisions and their signatures
are immutable and never carried forward) and **Decision 2 = 2a** (SharePoint
bytes are frozen locally at acknowledgement). Shipped across five phases —
migration_026, freeze-on-acknowledgement, self-describing quiz attempts, the
serve/verify endpoints, and the admin revisions viewer. The original proposal is
retained below for the rationale.

> **Known boundary (documented, not a defect).** Obligation/dashboard state
> remains *version-based* (the existing new-version ⇒ re-sign flow), now backed
> by immutable frozen bytes. A same-label, in-place content swap on a
> non-workflow policy freezes a new revision and preserves the old bytes, but
> does not by itself raise a new dashboard obligation — the guidance is to bump
> the version on a content change, which the approval workflow enforces
> automatically (PUT resets a workflow-governed policy to draft on any
> pointer/version change).

---

**Status (original proposal): Proposed — awaiting sign-off on two decisions (see §6).**
Prepared in response to external security review findings **#4** (a signature can
attest to content that later changed) and **#9** (a passed quiz attempt can be
graded against a definition that later changed). This is the one remaining
*security-substantive* item from that review; it is large enough (schema + API +
client) to design and get signed off before coding, in the same spirit as
ADR-120.

---

## 1. The problem, in the current schema

The portal already treats compliance records as append-only (ADR-109: `signatures`,
`quiz_attempts`, `policy_approvals`, `audit_log` all have `UPDATE`/`DELETE` revoked
from `governance_app`). The **records** are immutable. The **things they point at**
are not.

### 1.1 A signature binds to a *label*, not to *content* (#4)

`signatures` snapshots only a free-text version string:

```
-- db/schema.sql
signatures (
  policy_id      uuid  references policies(id),
  policy_version text  not null,   -- "snapshot of the version the user signed"
  user_oid ..., full_name ..., signed_at ..., ip_address ..., user_agent ...
)
```

But everything that defines *what was actually read* is mutable in place on
`policies`:

- `sharepoint_drive_id` / `sharepoint_item_id` / `sharepoint_url` — the pointer can be
  re-aimed at different content.
- For uploads (ADR-111), replacing the file **deletes the old file and stores a new
  one under the same policy id** (`PUT /trainings/:id` — verified in
  `uploads.test.js`: "replacing the file on update removes the superseded one").
- `version` itself is just editable `text`.

So "Jane signed **v1.0**" can, after the fact, resolve to entirely different bytes,
and the old bytes may no longer exist. The attestation is not reproducible — which is
the whole point of an acknowledgement ledger.

The existing "new version ⇒ re-sign" logic (a signature is matched to the *current*
`policies.version`) mitigates the *forward* case, but nothing **freezes the content**
that a past signature refers to, and a same-label in-place edit defeats even the
re-sign trigger.

### 1.2 A quiz pass binds to a mutable definition (#9)

```
-- db/migration_011_quizzes.sql
quiz_questions (..., prompt, options jsonb, correct_index int, points int)   -- UPDATE/DELETE granted
quiz_attempts  (..., score, max_score, pct, passed, answers jsonb, at)       -- append-only
```

`quiz_attempts` records the user's `answers` and computed `pct`/`passed`, but the
definition it was graded against (`quiz_questions.correct_index`, `points`, `pass_pct`)
is fully editable and deletable. Change a `correct_index` after the fact and every
past "passed" silently means something different; delete a question and the attempt
can no longer be reconstructed. A passed attempt is **not self-describing**.

---

## 2. Design goal

Every acknowledgement and every quiz pass must be **provably bound to the exact
content / definition in force at that moment**, so it can be re-served and
re-verified for the life of the record — *without* disrupting the normal draft →
edit → publish workflow.

The mechanism is a **content-addressed immutable revision**: an append-only snapshot
of content identity (a hash for uploads, SharePoint's immutable etag for hosted
docs), frozen at publish, that compliance records reference instead of a free-text
label.

---

## 3. Policy content revisions (#4)

### 3.1 New append-only table

```
-- migration_026 (proposed)
create table policy_revisions (
  id                  uuid primary key default gen_random_uuid(),
  policy_id           uuid not null references policies(id),
  version_label       text not null,             -- the human label at freeze time ("v1.0")
  source              text not null check (source in ('SharePoint','Upload')),
  -- content identity — whichever applies:
  sharepoint_drive_id text,
  sharepoint_item_id  text,
  sharepoint_etag     text,                       -- SP's immutable content-version id
  upload_path         text,                       -- storage key of the FROZEN file (never overwritten)
  content_sha256      text,                        -- hash of the exact bytes (null for legacy/unverified)
  content_size        bigint,
  content_mime        text,
  integrity           text not null default 'verified'
                        check (integrity in ('verified','etag-only','legacy-unverified')),
  supersedes_id       uuid references policy_revisions(id),
  frozen_at           timestamptz not null default now(),
  frozen_by           uuid references employees(oid)
);
create index on policy_revisions (policy_id, frozen_at);
-- append-only, per ADR-109:
grant select, insert on policy_revisions to governance_app;
revoke update, delete on policy_revisions from governance_app;
```

Signatures gain a foreign key to the exact revision:

```
alter table signatures add column revision_id uuid references policy_revisions(id);
```

The FK, like the ledger FKs hardened in #8, means a referenced revision (and its
frozen file) can never be deleted while a signature relies on it.

### 3.2 When a revision is frozen

At **publish** — the workflow's terminal transition, already made atomic under a row
lock in #6/#7. Freezing inside that existing transaction is the natural, race-free
point: no new lifecycle, no new endpoint to protect. Draft/edit churn freezes
nothing.

- **Upload source:** copy-on-freeze into a content-addressed store —
  `revisions/<sha256>` — computing `content_sha256` from the exact bytes. The live
  `policies.upload_path` continues to point at the mutable working copy; the frozen
  file is immutable and GC-protected by the signature FK. (This dovetails with the
  dated uploads snapshots added for DR in #14.)
- **SharePoint source:** capture `sharepoint_etag` (SharePoint's immutable
  content-version id) + size + mime. Whether we *also* copy the bytes locally is
  **Decision 2** (§6).

### 3.3 What the reader and dashboard show

- Reader: "You are acknowledging **v1.0**, frozen 2026-09-11" — the acknowledgement
  UI names the exact revision, and the preview streams the *frozen* bytes.
- Dashboard/obligations: compliance is measured against the **current** revision;
  history shows "signed v1.0 ✓, v1.1 pending" per person.

### 3.4 Backfill

Create one synthetic `policy_revisions` row per existing distinct
`(policy_id, policy_version)`, point existing `signatures.revision_id` at it, and mark
it `integrity = 'legacy-unverified'` (we capture the current pointer but honestly
cannot claim a hash for content that may already have changed). New signatures from
day one are `verified`.

---

## 4. Quiz revisions (#9)

Two options; I recommend the lighter one.

**Option Q1 — snapshot table.** A `quiz_revisions` row (full question set as jsonb +
`pass_pct` + hash), with `quiz_attempts.quiz_revision_id`. Editing a question freezes
a new revision. Nicer if the UI needs to *label* "quiz v2", but it is a new table and
join.

**Option Q2 — self-describing attempt (recommended).** Add to `quiz_attempts`:

```
alter table quiz_attempts add column graded_against jsonb;     -- exact questions+correct_index+points+pass_pct used
alter table quiz_attempts add column definition_sha256 text;   -- hash of that definition
```

Grading already happens server-side in the quiz-submit path; we simply record the
definition it used. Every attempt becomes **independently reproducible with zero
joins**, and no later quiz edit can change what a past pass meant. It closes #9 with
one migration and one small change to the submit handler, and it composes with the
append-only grant already on `quiz_attempts`.

Recommendation: **Q2.**

---

## 5. Verification & integrity

- `GET /api/policies/:id/revisions` (governed) — list frozen revisions.
- `GET /api/policies/:id/revisions/:rev/verify` (admin) — re-hash the stored bytes,
  compare to `content_sha256`, return `{ ok, integrity }`. Proves a frozen document is
  intact and un-tampered — the evidence an auditor asks for.
- Quiz: `definition_sha256` on each attempt is self-verifying against
  `graded_against`.

---

## 6. Decisions needed before implementation

### Decision 1 — edit semantics (what happens to existing signatures on a content change)

| | Option A — new revision + new obligation *(recommended)* | Option B — "minor edit" carry-forward | Option C — lock published content |
|---|---|---|---|
| On content edit | Freeze a new revision; old signatures stay valid as *historical truth* (Jane really did read v1.0); everyone in scope must acknowledge the new revision | Editor flags material vs non-material; non-material carries old signatures to the new revision | Published content is immutable; any change must be a brand-new policy version |
| Guarantee | Strong; append-only; no destruction | Weaker — "material?" is a human judgment that can be gamed | Strongest, but rigid (no typo fix without a re-sign cycle) |
| Audit trail | Clean: every revision + who signed which | Carry-forward must itself be an audited, justified admin action | Clean but heavyweight |

**Recommendation: Option A** — every content change produces a new immutable revision
and a new acknowledgement obligation; old revisions and their signatures are immutable
and are **never** silently carried forward. This is how real policy-management systems
behave, it needs no "material/non-material" judgment call, and it is the simplest
defensible model. (If a true no-op typo fix is common enough to matter, we can later
add an *explicitly audited, admin-only, justification-required* carry-forward — but I'd
ship A first and only add that if you actually need it.)

### Decision 2 — SharePoint-hosted content

- **2a — freeze bytes locally at publish** *(recommended for a compliance/air-gapped
  posture)*: true immutability independent of SharePoint, and the frozen document
  survives in your own DR snapshots. Cost: storage per revision (bounded by retention),
  and one byte-fetch at publish. Sets `integrity = 'verified'`.
- **2b — bind to the SharePoint etag only**: cheaper, no local copy, trusts SharePoint's
  own versioning/immutability. Sets `integrity = 'etag-only'`; the `verify` endpoint can
  only re-check the etag, not re-hash bytes.

Uploads are always frozen locally regardless (they have no external system of record).

**Recommendation: 2a** — you already retain uploads for DR (#14) and the whole
posture is air-gap-friendly; local freezing makes the acknowledgement genuinely
self-contained.

---

## 7. Rollout (phased, same CI-green per-commit cadence as the review fixes)

1. **migration_026** — `policy_revisions` (+ append-only grants), `signatures.revision_id`,
   `quiz_attempts.graded_against` / `definition_sha256`, backfill synthetic legacy
   revisions. (Registered in all three places per `DATABASE-MIGRATIONS.md`:
   `migrate.js`, `test/helpers/db.js`, `docker-compose.yml`.)
2. **Freeze-on-publish** wired into the existing atomic publish transaction; upload
   copy-on-freeze into the content-addressed store.
3. **Quiz** — capture `graded_against` in the submit handler (Q2).
4. **Serve + verify** endpoints; obligation/dashboard queries keyed on the current
   revision.
5. **Client** — reader names the revision and streams frozen bytes; dashboard shows
   per-revision obligation state.

Each phase is a focused, tested, CI-verified commit and ff-merged like the rest.

## 8. Test plan

- Freeze exactly one revision on publish; none on draft edits.
- Edit published content → a new revision **and** a new obligation appear; the prior
  signature still resolves to and serves the *old* frozen bytes.
- `verify` re-hashes an upload revision and matches; a tampered stored file fails.
- Quiz: change a `correct_index` after a pass → the past attempt's `graded_against` /
  `pct` are unchanged and still reproduce the original result.
- Backfill: existing signatures gain a `legacy-unverified` revision without error.

---

## 9. Scope summary

- **DB:** 1 migration, 1 new table, 3 columns, 1 backfill.
- **API:** freeze-on-publish, content-addressed upload store, quiz-grading snapshot,
  revision serve + verify, obligation queries on current revision.
- **Client:** reader copy + per-revision dashboard state.
- **Effort:** ~4–6 focused commits. Entirely Azure-independent; reuses the existing
  append-only-by-grant model (ADR-109), the atomic publish path (#6/#7), and the
  ledger-FK protection (#8).

On sign-off of §6, this becomes **ADR-121** (Accepted) and implementation begins.
