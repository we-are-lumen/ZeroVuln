-- Drop reward_per_approved and add required expired_at on contracts.

alter table if exists public.contracts
  drop column if exists reward_per_approved;

alter table if exists public.contracts
  add column if not exists expired_at timestamptz;

alter table if exists public.contracts
  alter column expired_at set not null;
