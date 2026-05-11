-- Add required JSON source payload on contracts.

alter table if exists public.contracts
  add column if not exists source jsonb;

update public.contracts
set source = jsonb_build_object(
  'code', coalesce(content_inline, ''),
  'language', coalesce(language, 'solidity')
)
where source is null;

alter table if exists public.contracts
  alter column source set not null;
