alter table "public"."auditor_findings"
  add column if not exists "reward_amount" bigint not null default 0;
