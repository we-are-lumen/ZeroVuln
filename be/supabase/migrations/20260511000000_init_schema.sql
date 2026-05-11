-- ZeroVuln initial schema
-- All access goes through Edge Functions using the service role key.
-- RLS is enabled with default-deny policies so anon/authenticated tokens cannot read anything directly.

set check_function_bodies = off;

create extension if not exists "pgcrypto";

------------------------------------------------------------------
-- enums
------------------------------------------------------------------
do $$ begin
  create type contract_status   as enum ('draft','audited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type audit_status      as enum ('pending','running','succeeded','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type finding_severity  as enum ('critical','high','medium','low','info');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ai_finding_status as enum ('open','fixed','dismissed','accepted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type auditor_review_status as enum ('draft','submitted','approved','rejected');
exception when duplicate_object then null; end $$;

------------------------------------------------------------------
-- updated_at trigger helper
------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

------------------------------------------------------------------
-- users
------------------------------------------------------------------
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text unique not null,
  is_admin        boolean not null default false,
  settings        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- contracts
------------------------------------------------------------------
create table if not exists public.contracts (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.users(id) on delete cascade,
  is_catalog        boolean not null default false,
  name              text,
  status            contract_status not null default 'draft',
  storage_uri       text,
  gas_estimate      bigint,
  compile_status    text,
  compiler_version  text,
  og_storage_uri    text,
  content_hash      text,
  content_inline    text,
  language          text not null default 'solidity',
  size_bytes        integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists contracts_owner_idx   on public.contracts(owner_id) where is_catalog = false;
create index if not exists contracts_catalog_idx on public.contracts(is_catalog) where is_catalog = true;
create trigger contracts_set_updated_at before update on public.contracts
  for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- audits
------------------------------------------------------------------
create table if not exists public.audits (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts(id) on delete cascade,
  status              audit_status not null default 'pending',
  kind                text not null default 'audit', -- 'audit' | 'codegen' | 'auto_fix' | 'gas_opt'
  model               text,
  prompt_template     text,
  og_compute_job_id   text,
  og_compute_provider text,
  og_compute_cost     numeric,
  summary             text,
  error               text,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists audits_contract_idx on public.audits(contract_id);
create index if not exists audits_status_idx   on public.audits(status);
create trigger audits_set_updated_at before update on public.audits
  for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- ai_findings
------------------------------------------------------------------
create table if not exists public.ai_findings (
  id              uuid primary key default gen_random_uuid(),
  audit_id        uuid not null references public.audits(id) on delete cascade,
  severity        finding_severity not null,
  title           text not null,
  description     text,
  file_path       text,
  line_start      integer,
  line_end        integer,
  function_name   text,
  confidence      numeric,
  gas_saved       bigint,
  status          ai_finding_status not null default 'open',
  reasoning_trace jsonb,
  reasoning_uri   text,
  reasoning_hash  text,
  anchor_tx_hash  text,
  remediation     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ai_findings_audit_idx on public.ai_findings(audit_id);
create trigger ai_findings_set_updated_at before update on public.ai_findings
  for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- auditor_findings
------------------------------------------------------------------
create table if not exists public.auditor_findings (
  id              uuid primary key default gen_random_uuid(),
  contributor_id  uuid not null references public.users(id)     on delete cascade,
  contract_id     uuid not null references public.contracts(id) on delete restrict,
  severity        finding_severity not null,
  title           text not null,
  description     text,
  review_status   auditor_review_status not null default 'draft',
  submitted_at    timestamptz,
  decided_at      timestamptz,
  code_uri        text,
  code_hash       text,
  analysis_uri    text,
  analysis_hash   text,
  dataset_uri     text,
  dataset_hash    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists auditor_findings_contributor_idx on public.auditor_findings(contributor_id);
create index if not exists auditor_findings_review_idx      on public.auditor_findings(review_status);
create trigger auditor_findings_set_updated_at before update on public.auditor_findings
  for each row execute function public.set_updated_at();

-- guard: contract_id must reference a catalog contract
create or replace function public.auditor_findings_check_catalog()
returns trigger language plpgsql as $$
declare
  v_is_catalog boolean;
begin
  select is_catalog into v_is_catalog from public.contracts where id = new.contract_id;
  if v_is_catalog is null then
    raise exception 'contract_id % does not exist', new.contract_id;
  end if;
  if v_is_catalog = false then
    raise exception 'auditor_findings.contract_id must reference a catalog contract (is_catalog=true)';
  end if;
  return new;
end $$;

drop trigger if exists auditor_findings_check_catalog_ins on public.auditor_findings;
create trigger auditor_findings_check_catalog_ins
  before insert or update of contract_id on public.auditor_findings
  for each row execute function public.auditor_findings_check_catalog();

------------------------------------------------------------------
-- dataset_snapshots
------------------------------------------------------------------
create table if not exists public.dataset_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  version                text unique not null,
  manifest_uri           text,
  manifest_hash          text,
  bundle_uri             text,
  bundle_hash            text,
  auditor_finding_count  integer not null default 0,
  created_by             uuid references public.users(id) on delete set null,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger dataset_snapshots_set_updated_at before update on public.dataset_snapshots
  for each row execute function public.set_updated_at();

------------------------------------------------------------------
-- RLS: default deny on every table
-- (all reads/writes happen via Edge Functions w/ service role key)
------------------------------------------------------------------
alter table public.users              enable row level security;
alter table public.contracts          enable row level security;
alter table public.audits             enable row level security;
alter table public.ai_findings        enable row level security;
alter table public.auditor_findings   enable row level security;
alter table public.dataset_snapshots  enable row level security;
-- no policies created => anon/authenticated cannot SELECT/INSERT/UPDATE/DELETE.
-- service_role bypasses RLS, which is what Edge Functions use.
