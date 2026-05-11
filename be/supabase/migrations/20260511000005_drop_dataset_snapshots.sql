-- Remove dataset snapshot feature.
drop table if exists public.dataset_snapshots cascade;

alter table if exists public.auditor_findings
  drop column if exists dataset_uri,
  drop column if exists dataset_hash;
