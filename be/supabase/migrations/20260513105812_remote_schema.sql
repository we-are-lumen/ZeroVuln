alter table "public"."contracts" alter column "reward_per_finding" drop default;

alter table "public"."contracts" alter column "reward_per_finding" set data type bigint using "reward_per_finding"::bigint;

alter table "public"."contracts" alter column "total_reward" set data type bigint using "total_reward"::bigint;


