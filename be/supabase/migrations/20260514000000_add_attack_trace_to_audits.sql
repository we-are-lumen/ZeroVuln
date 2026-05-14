alter table public.audits
  add column if not exists attack_trace jsonb;