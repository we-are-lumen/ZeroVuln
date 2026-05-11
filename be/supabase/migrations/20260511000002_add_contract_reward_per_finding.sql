alter table public.contracts
  add column reward_per_finding double precision not null default 0;
