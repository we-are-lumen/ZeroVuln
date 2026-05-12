revoke delete on table "public"."prompt_config" from "anon";

revoke insert on table "public"."prompt_config" from "anon";

revoke references on table "public"."prompt_config" from "anon";

revoke select on table "public"."prompt_config" from "anon";

revoke trigger on table "public"."prompt_config" from "anon";

revoke truncate on table "public"."prompt_config" from "anon";

revoke update on table "public"."prompt_config" from "anon";

revoke delete on table "public"."prompt_config" from "authenticated";

revoke insert on table "public"."prompt_config" from "authenticated";

revoke references on table "public"."prompt_config" from "authenticated";

revoke select on table "public"."prompt_config" from "authenticated";

revoke trigger on table "public"."prompt_config" from "authenticated";

revoke truncate on table "public"."prompt_config" from "authenticated";

revoke update on table "public"."prompt_config" from "authenticated";

revoke delete on table "public"."prompt_config" from "service_role";

revoke insert on table "public"."prompt_config" from "service_role";

revoke references on table "public"."prompt_config" from "service_role";

revoke select on table "public"."prompt_config" from "service_role";

revoke trigger on table "public"."prompt_config" from "service_role";

revoke truncate on table "public"."prompt_config" from "service_role";

revoke update on table "public"."prompt_config" from "service_role";

alter table "public"."prompt_config" drop constraint "prompt_config_pkey";

drop index if exists "public"."prompt_config_pkey";

drop table "public"."prompt_config";

alter table "public"."audits" drop column "prompt_template";

alter table "public"."contracts" add column "total_reward" double precision;

alter table "public"."contracts" alter column "reward_per_finding" drop not null;


