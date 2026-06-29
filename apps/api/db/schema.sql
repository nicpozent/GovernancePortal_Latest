-- ============================================================
--  Birgma Governance Portal — PostgreSQL schema
--  Run:  psql "$DATABASE_URL" -f db/schema.sql
-- ============================================================
create extension if not exists "pgcrypto";

-- People (synced from Entra ID / AD, or added locally) ---------
create table if not exists employees (
  oid           uuid primary key,                       -- Entra ID objectId (stable identity)
  upn           text not null,                           -- userPrincipalName
  email         text,
  display_name  text not null,
  job_title     text,
  department    text not null default 'Unassigned',      -- maps to the role/group used for policy assignment
  source        text not null default 'Entra ID'         -- 'Entra ID' | 'Active Directory' | 'Local'
                 check (source in ('Entra ID','Active Directory','Local')),
  status        text not null default 'Active',
  is_admin      boolean not null default false,          -- mirror of the Governance.Admin app role (optional cache)
  synced_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- Governance documents -----------------------------------------
create table if not exists policies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  doc_type            text not null
                       check (doc_type in ('Policy','Process','Procedure','Standard','Guideline','Training')),
  version             text not null,                     -- authoritative copy of the SharePoint version label
  sharepoint_drive_id text,
  sharepoint_item_id  text,
  sharepoint_url      text not null,
  owner               text,
  effective_date      date,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

-- Which departments/roles MUST sign a given policy -------------
create table if not exists policy_roles (
  policy_id  uuid not null references policies(id) on delete cascade,
  role       text not null,                              -- matches employees.department / Entra group displayName
  primary key (policy_id, role)
);

-- Append-only signature ledger (the compliance system of record)
-- No UPDATE / DELETE in application code — corrections are new rows.
create table if not exists signatures (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid not null references policies(id),
  policy_version text not null,                          -- snapshot of the version the user actually signed
  user_oid       uuid not null references employees(oid),
  full_name      text not null,                          -- typed first + last name at signing time
  acknowledged   boolean not null default true,          -- the "I have read and understood" checkbox
  signed_at      timestamptz not null default now(),     -- auto-captured timestamp
  ip_address     inet,
  user_agent     text
);
create index if not exists idx_sig_policy on signatures (policy_id);
create index if not exists idx_sig_user   on signatures (user_oid);

-- Directory sync audit -----------------------------------------
create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  added       int  not null default 0,
  updated     int  not null default 0,
  status      text not null default 'running',           -- running | success | error
  error       text
);

-- Revoke destructive grants on the ledger at the DB level too:
-- (run as superuser against your app role)
-- revoke update, delete on signatures from governance_app;
