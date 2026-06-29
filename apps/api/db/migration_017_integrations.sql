-- ============================================================
--  Migration 017 — integration / log-forwarding config
--  A single-row table holding the admin-managed settings for:
--    * PUSH: forward audit/business events to an external webhook/API
--    * PULL: an API key external systems use to consume the audit feed
-- ============================================================
create table if not exists integration_config (
  id              int primary key default 1,
  forward_enabled boolean not null default false,
  forward_url     text,
  forward_token   text,
  feed_enabled    boolean not null default false,
  feed_api_key    text,
  last_forward_at timestamptz,
  last_forward_status text,
  updated_at      timestamptz not null default now(),
  constraint integration_config_singleton check (id = 1)
);
insert into integration_config (id) values (1) on conflict (id) do nothing;

grant select, insert, update on integration_config to governance_app;
