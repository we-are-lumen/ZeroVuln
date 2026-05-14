alter table public.ai_findings
  add column if not exists attack_trace jsonb;

alter table public.audits
  drop column if exists attack_trace;