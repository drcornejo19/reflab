-- Destructive rollback for the institutional multi-tenant foundation.
-- Back up the database first. New institutional records created after the
-- forward migration will be removed when their tables are dropped.

begin;

drop policy if exists institutional_content_storage_read on storage.objects;
drop policy if exists institutional_content_storage_insert on storage.objects;
drop policy if exists institutional_content_storage_update on storage.objects;
drop policy if exists institutional_content_storage_delete on storage.objects;

delete from storage.buckets bucket
where bucket.id = 'institutional-content'
  and not exists (
    select 1
    from storage.objects object_row
    where object_row.bucket_id = bucket.id
  );

drop policy if exists user_roles_read_own on public.user_roles;
drop policy if exists institutions_member_read on public.institutions;
drop policy if exists institutions_admin_update on public.institutions;
drop policy if exists institution_profiles_member_read on public.institution_profiles;
drop policy if exists institution_profiles_admin_manage on public.institution_profiles;
drop policy if exists institution_members_legacy_scoped_read on public.institution_members;
drop policy if exists institution_members_legacy_admin_manage on public.institution_members;
drop policy if exists institution_programs_course_read on public.institution_programs;
drop policy if exists institution_programs_course_manage on public.institution_programs;
drop policy if exists institution_program_items_course_read on public.institution_program_items;
drop policy if exists institution_program_items_course_manage on public.institution_program_items;
drop policy if exists institution_progress_scoped_read on public.institution_student_progress;
drop policy if exists institution_progress_own_update on public.institution_student_progress;
drop policy if exists institutional_clips_scoped_read on public.institutional_clips;
drop policy if exists institutional_clips_scoped_insert on public.institutional_clips;
drop policy if exists institutional_clips_scoped_update on public.institutional_clips;

drop trigger if exists validate_institution_program_items_tenant_links
  on public.institution_program_items;
drop trigger if exists validate_institution_student_progress_tenant_links
  on public.institution_student_progress;

drop trigger if exists validate_institution_assessment_session_write
  on public.institution_assessment_sessions;
drop function if exists public.validate_institution_assessment_session();

drop table if exists public.institution_demo_sessions cascade;
drop table if exists public.institution_audit_logs cascade;
drop table if exists public.institution_data_consents cascade;
drop table if exists public.institution_notification_recipients cascade;
drop table if exists public.institution_notification_campaigns cascade;
drop table if exists public.institution_assessment_feedback cascade;
drop table if exists public.institution_assessment_history cascade;

alter table if exists public.attempts
  drop column if exists assessment_session_id,
  drop column if exists institution_group_id,
  drop column if exists institution_id;

alter table if exists public.exam_results
  drop column if exists assessment_session_id,
  drop column if exists institution_group_id,
  drop column if exists institution_id;

alter table if exists public.rules_exam_results
  drop column if exists assessment_session_id,
  drop column if exists institution_group_id,
  drop column if exists institution_id;

drop table if exists public.institution_assessment_sessions cascade;
drop table if exists public.institution_assessment_assignments cascade;
drop table if exists public.institution_assessment_items cascade;
drop table if exists public.institution_assessments cascade;

alter table if exists public.institutional_clips
  drop column if exists content_id;

drop table if exists public.institution_content_assignments cascade;
drop table if exists public.institution_contents cascade;
drop table if exists public.institution_group_memberships cascade;
drop table if exists public.institution_groups cascade;
drop table if exists public.institution_cohorts cascade;
drop table if exists public.institution_membership_permission_overrides cascade;
drop table if exists public.institution_membership_roles cascade;
drop table if exists public.institution_role_permissions cascade;
drop table if exists public.institution_memberships cascade;
drop table if exists public.institution_roles cascade;
drop table if exists public.institution_permissions cascade;

drop function if exists public.validate_institution_tenant_links();

drop function if exists public.institution_storage_tenant(text);
drop function if exists public.institution_is_campaign_recipient(uuid);
drop function if exists public.institution_can_access_assessment(uuid);
drop function if exists public.institution_can_access_content(uuid);
drop function if exists public.institution_can_access_group(uuid);
drop function if exists public.institution_has_permission(uuid, text);
drop function if exists public.institution_has_active_membership(uuid);
drop function if exists public.institution_is_super_admin();
drop function if exists public.institution_request_user_id();

alter table if exists public.institution_program_items
  drop column if exists institution_id;

alter table if exists public.institution_programs
  drop constraint if exists institution_programs_sport_type_check,
  drop constraint if exists institution_programs_metadata_object_check,
  drop column if exists sport_type,
  drop column if exists timezone,
  drop column if exists category,
  drop column if exists metadata;

update public.institutions
set institution_type = 'association'
where institution_type not in ('school', 'league', 'association');

alter table if exists public.institutions
  drop constraint if exists institutions_institution_type_check,
  drop constraint if exists institutions_status_check,
  drop constraint if exists institutions_license_limit_check,
  drop constraint if exists institutions_enabled_sports_check,
  drop constraint if exists institutions_privacy_settings_object_check,
  drop constraint if exists institutions_assessment_settings_object_check,
  drop constraint if exists institutions_metrics_settings_object_check,
  drop constraint if exists institutions_brand_color_check;

drop index if exists public.institutions_slug_unique;
drop index if exists public.institutions_domain_unique;
drop index if exists public.institutions_subdomain_unique;
drop index if exists public.institutions_status_demo_idx;

alter table if exists public.institutions
  drop column if exists slug,
  drop column if exists province_state,
  drop column if exists timezone,
  drop column if exists logo_url,
  drop column if exists brand_color,
  drop column if exists domain,
  drop column if exists subdomain,
  drop column if exists institutional_email,
  drop column if exists responsible_name,
  drop column if exists plan_key,
  drop column if exists license_limit,
  drop column if exists enabled_sports,
  drop column if exists privacy_settings,
  drop column if exists assessment_settings,
  drop column if exists metrics_settings,
  drop column if exists is_demo,
  drop column if exists created_by_user_id,
  drop column if exists deleted_at;

alter table if exists public.institutions
  add constraint institutions_institution_type_check check (
    institution_type in ('school', 'league', 'association')
  );

notify pgrst, 'reload schema';

commit;
