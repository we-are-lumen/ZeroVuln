drop trigger if exists "ai_findings_set_updated_at" on "public"."ai_findings";

drop trigger if exists "auditor_findings_check_catalog_ins" on "public"."auditor_findings";

drop trigger if exists "auditor_findings_set_updated_at" on "public"."auditor_findings";

drop trigger if exists "audits_set_updated_at" on "public"."audits";

drop trigger if exists "contracts_set_updated_at" on "public"."contracts";

drop trigger if exists "users_set_updated_at" on "public"."users";

alter table "public"."ai_findings" drop constraint "ai_findings_audit_id_fkey";

alter table "public"."auditor_findings" drop constraint "auditor_findings_contract_id_fkey";

alter table "public"."auditor_findings" drop constraint "auditor_findings_contributor_id_fkey";

alter table "public"."audits" drop constraint "audits_contract_id_fkey";

alter table "public"."contracts" drop constraint "contracts_owner_id_fkey";

alter table "public"."ai_findings" alter column "severity" set data type public.finding_severity using "severity"::text::public.finding_severity;

alter table "public"."ai_findings" alter column "status" set default 'open'::public.ai_finding_status;

alter table "public"."ai_findings" alter column "status" set data type public.ai_finding_status using "status"::text::public.ai_finding_status;

alter table "public"."auditor_findings" alter column "review_status" set default 'draft'::public.auditor_review_status;

alter table "public"."auditor_findings" alter column "review_status" set data type public.auditor_review_status using "review_status"::text::public.auditor_review_status;

alter table "public"."auditor_findings" alter column "severity" set data type public.finding_severity using "severity"::text::public.finding_severity;

alter table "public"."audits" alter column "status" set default 'pending'::public.audit_status;

alter table "public"."audits" alter column "status" set data type public.audit_status using "status"::text::public.audit_status;

alter table "public"."contracts" alter column "expired_at" drop not null;

alter table "public"."contracts" alter column "status" set default 'draft'::public.contract_status;

alter table "public"."contracts" alter column "status" set data type public.contract_status using "status"::text::public.contract_status;

alter table "public"."ai_findings" add constraint "ai_findings_audit_id_fkey" FOREIGN KEY (audit_id) REFERENCES public.audits(id) ON DELETE CASCADE not valid;

alter table "public"."ai_findings" validate constraint "ai_findings_audit_id_fkey";

alter table "public"."auditor_findings" add constraint "auditor_findings_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE RESTRICT not valid;

alter table "public"."auditor_findings" validate constraint "auditor_findings_contract_id_fkey";

alter table "public"."auditor_findings" add constraint "auditor_findings_contributor_id_fkey" FOREIGN KEY (contributor_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."auditor_findings" validate constraint "auditor_findings_contributor_id_fkey";

alter table "public"."audits" add constraint "audits_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE not valid;

alter table "public"."audits" validate constraint "audits_contract_id_fkey";

alter table "public"."contracts" add constraint "contracts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE not valid;

alter table "public"."contracts" validate constraint "contracts_owner_id_fkey";

CREATE TRIGGER ai_findings_set_updated_at BEFORE UPDATE ON public.ai_findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER auditor_findings_check_catalog_ins BEFORE INSERT OR UPDATE OF contract_id ON public.auditor_findings FOR EACH ROW EXECUTE FUNCTION public.auditor_findings_check_catalog();

CREATE TRIGGER auditor_findings_set_updated_at BEFORE UPDATE ON public.auditor_findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audits_set_updated_at BEFORE UPDATE ON public.audits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER contracts_set_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


