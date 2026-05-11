drop extension if exists "pg_net";

revoke delete on table "public"."ai_findings" from "anon";

revoke insert on table "public"."ai_findings" from "anon";

revoke select on table "public"."ai_findings" from "anon";

revoke update on table "public"."ai_findings" from "anon";

revoke delete on table "public"."ai_findings" from "authenticated";

revoke insert on table "public"."ai_findings" from "authenticated";

revoke select on table "public"."ai_findings" from "authenticated";

revoke update on table "public"."ai_findings" from "authenticated";

revoke delete on table "public"."auditor_findings" from "anon";

revoke insert on table "public"."auditor_findings" from "anon";

revoke select on table "public"."auditor_findings" from "anon";

revoke update on table "public"."auditor_findings" from "anon";

revoke delete on table "public"."auditor_findings" from "authenticated";

revoke insert on table "public"."auditor_findings" from "authenticated";

revoke select on table "public"."auditor_findings" from "authenticated";

revoke update on table "public"."auditor_findings" from "authenticated";

revoke delete on table "public"."audits" from "anon";

revoke insert on table "public"."audits" from "anon";

revoke select on table "public"."audits" from "anon";

revoke update on table "public"."audits" from "anon";

revoke delete on table "public"."audits" from "authenticated";

revoke insert on table "public"."audits" from "authenticated";

revoke select on table "public"."audits" from "authenticated";

revoke update on table "public"."audits" from "authenticated";

revoke delete on table "public"."contracts" from "anon";

revoke insert on table "public"."contracts" from "anon";

revoke select on table "public"."contracts" from "anon";

revoke update on table "public"."contracts" from "anon";

revoke delete on table "public"."contracts" from "authenticated";

revoke insert on table "public"."contracts" from "authenticated";

revoke select on table "public"."contracts" from "authenticated";

revoke update on table "public"."contracts" from "authenticated";

revoke delete on table "public"."users" from "anon";

revoke insert on table "public"."users" from "anon";

revoke select on table "public"."users" from "anon";

revoke update on table "public"."users" from "anon";

revoke delete on table "public"."users" from "authenticated";

revoke insert on table "public"."users" from "authenticated";

revoke select on table "public"."users" from "authenticated";

revoke update on table "public"."users" from "authenticated";

alter table "public"."ai_findings" drop column "anchor_tx_hash";

alter table "public"."ai_findings" drop column "file_path";

alter table "public"."ai_findings" drop column "function_name";

alter table "public"."ai_findings" drop column "reasoning_hash";

alter table "public"."ai_findings" drop column "reasoning_uri";

alter table "public"."auditor_findings" drop column "analysis_hash";

alter table "public"."auditor_findings" drop column "analysis_uri";

alter table "public"."auditor_findings" drop column "code_hash";

alter table "public"."auditor_findings" drop column "code_uri";

alter table "public"."auditor_findings" add column "line_end" bigint;

alter table "public"."auditor_findings" add column "line_start" bigint;

alter table "public"."audits" drop column "error";

alter table "public"."audits" drop column "model";

alter table "public"."audits" drop column "og_compute_cost";

alter table "public"."audits" drop column "og_compute_job_id";

alter table "public"."audits" drop column "og_compute_provider";

alter table "public"."contracts" drop column "compile_status";

alter table "public"."contracts" drop column "compiler_version";

alter table "public"."contracts" drop column "content_hash";

alter table "public"."contracts" drop column "content_inline";

alter table "public"."contracts" drop column "og_storage_uri";

alter table "public"."contracts" drop column "size_bytes";

alter table "public"."contracts" drop column "source";

alter table "public"."contracts" drop column "storage_uri";

alter table "public"."contracts" add column "source_code" jsonb[] default '{}'::jsonb[];

alter table "public"."users" drop column "settings";


