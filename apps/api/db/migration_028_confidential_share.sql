-- ============================================================
--  Migration 028 — CONFIDENTIAL DOCUMENTS + SHARE REQUESTS (finding #17)
--
--  #17: managers can assign a document to ANY group, imposing obligations on
--  people outside their team. Assignment stays flexible by default (a product
--  choice), but a document can now be marked CONFIDENTIAL by its owner or an
--  admin. Once confidential, EXPANDING who it reaches (adding recipient groups)
--  by anyone other than the person who marked it (its "gatekeeper") or an admin
--  requires an explicit SHARE REQUEST that the gatekeeper approves — a light
--  request/approve flow modelled on the approval workflow (ADR-120).
-- ============================================================

alter table policies add column if not exists confidential boolean not null default false;
alter table policies add column if not exists confidential_by uuid references employees(oid);   -- the gatekeeper
alter table policies add column if not exists confidential_at timestamptz;

-- A request to add recipient groups to a confidential document.
create table if not exists share_requests (
  id            bigserial primary key,
  policy_id     uuid not null references policies(id) on delete cascade,
  requested_by  uuid not null references employees(oid),
  group_ids     uuid[] not null,                         -- groups the requester wants to add
  comment       text,
  status        text not null default 'pending'
                  check (status in ('pending','approved','denied','cancelled')),
  decided_by    uuid references employees(oid),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_share_requests_policy    on share_requests (policy_id, status);
create index if not exists idx_share_requests_requester on share_requests (requested_by, status);
