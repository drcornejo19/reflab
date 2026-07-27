-- RefLab canonical database baseline.
-- DRAFT ONLY: this migration is for an empty database and must not be applied
-- to the current production project.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Installation guard
-- ---------------------------------------------------------------------------

do $guard$
declare
  application_table_count integer;
  migration_count integer := 0;
  managed_bucket_count integer := 0;
begin
  if to_regclass('reflab_meta.reflab_schema_state') is not null then
    raise exception 'RefLab schema state already exists; canonical baseline aborted';
  end if;

  select count(*)
  into application_table_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and relation.relname not in ('spatial_ref_sys');

  if application_table_count > 0 then
    raise exception
      'Public schema contains % application table(s); canonical baseline aborted',
      application_table_count;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute
      'select count(*) from supabase_migrations.schema_migrations'
      into migration_count;
  end if;

  if migration_count > 0 then
    raise exception
      'Migration history contains % row(s); canonical baseline aborted',
      migration_count;
  end if;

  if to_regclass('storage.buckets') is not null then
    execute $query$
      select count(*)
      from storage.buckets
      where id in (
        'avatars',
        'institutional-content',
        'Videos',
        'Videos Modo Ingles'
      )
    $query$
    into managed_bucket_count;
  end if;

  if managed_bucket_count > 0 then
    raise exception
      'RefLab-managed storage buckets already exist; canonical baseline aborted';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- Private schemas and dedicated RLS owner
-- ---------------------------------------------------------------------------

create schema reflab_private;
create schema reflab_meta;

revoke all on schema reflab_private from public;
revoke all on schema reflab_meta from public;
revoke create on schema public from public;

do $roles$
declare
  existing_role record;
begin
  select
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolbypassrls
  into existing_role
  from pg_catalog.pg_roles
  where rolname = 'reflab_rls_owner';

  if not found then
    create role reflab_rls_owner
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  elsif existing_role.rolcanlogin
     or existing_role.rolsuper
     or existing_role.rolcreatedb
     or existing_role.rolcreaterole
     or existing_role.rolinherit
     or existing_role.rolbypassrls then
    raise exception
      'Existing role reflab_rls_owner has unsafe or incompatible attributes';
  end if;
end
$roles$;

-- Supabase migrations run as postgres. Membership allows the installer to
-- transfer only the approved helper functions to the dedicated NOLOGIN role.
grant reflab_rls_owner to postgres;

-- ---------------------------------------------------------------------------
-- Catalogs, identity, access plans and capabilities
-- ---------------------------------------------------------------------------

create table public.platform_roles (
  role_key text primary key,
  label text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.access_plans (
  plan_key text primary key,
  label text not null,
  audience text not null check (audience in ('individual', 'institution')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.capabilities (
  capability_key text primary key,
  label text not null,
  description text,
  category text not null default 'general',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_capabilities (
  plan_key text not null,
  capability_key text not null,
  created_at timestamptz not null default now(),
  primary key (plan_key, capability_key)
);

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_code_length_check check (char_length(code) between 2 and 3)
);

create table public.associations (
  id uuid primary key default gen_random_uuid(),
  country_id uuid,
  code text,
  name text not null,
  logo_url text,
  website_url text,
  country_code text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'institutional', 'api')),
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint associations_country_name_unique unique (country_id, name)
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  association_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  name text not null,
  short_name text,
  competition_type text not null default 'league'
    check (competition_type in ('league', 'cup', 'playoff', 'friendly', 'tournament', 'other')),
  provider text,
  source_type text not null default 'manual'
    check (source_type in ('institutional', 'api', 'manual')),
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_association_sport_name_unique
    unique (association_id, sport_type, name)
);

create table public.competition_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  label text not null,
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  provider text,
  source_type text not null default 'manual'
    check (source_type in ('institutional', 'api', 'manual')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_seasons_window_check
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint competition_seasons_competition_label_unique
    unique (competition_id, label)
);

create table public.competition_categories (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null,
  season_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  name text not null,
  level_order integer,
  referee_system text,
  var_supported boolean not null default false,
  provider text,
  source_type text not null default 'manual'
    check (source_type in ('institutional', 'api', 'manual')),
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_categories_scope_unique
    unique (competition_id, season_id, name)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  country_id uuid,
  association_id uuid,
  name text not null,
  short_name text,
  provider text,
  source_type text not null default 'manual'
    check (source_type in ('institutional', 'api', 'manual')),
  external_id text,
  crest_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  country_id uuid,
  association_id uuid,
  name text not null,
  city text,
  address text,
  provider text,
  source_type text not null default 'manual'
    check (source_type in ('institutional', 'api', 'manual')),
  external_id text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  institution_type text not null
    check (
      institution_type in (
        'school',
        'league',
        'association',
        'federation',
        'private_academy',
        'other'
      )
    ),
  country text,
  province_state text,
  city text,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  logo_url text,
  brand_color text not null default '#6fc11f'
    check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  domain text,
  subdomain text,
  institutional_email text,
  responsible_name text,
  status text not null default 'pending'
    check (status in ('pending', 'trial', 'active', 'suspended', 'expired', 'archived')),
  enabled_sports text[] not null default array['football_11']::text[]
    check (
      cardinality(enabled_sports) > 0
      and enabled_sports <@ array['football_11', 'futsal']::text[]
    ),
  privacy_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(privacy_settings) = 'object'),
  assessment_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(assessment_settings) = 'object'),
  metrics_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metrics_settings) = 'object'),
  is_demo boolean not null default false,
  created_by_user_id text,

  -- Release-window compatibility only. Canonical licensing lives in
  -- institution_subscriptions.
  plan_key text not null default 'academy'
    check (plan_key in ('academy', 'enterprise')),
  license_status text not null default 'inactive',
  license_start timestamptz,
  license_end timestamptz,
  license_limit integer not null default 0 check (license_limit >= 0),
  seats_total integer not null default 0 check (seats_total >= 0),
  seats_used integer not null default 0 check (seats_used >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint institutions_license_window_check
    check (license_end is null or license_start is null or license_end > license_start),
  constraint institutions_seat_usage_check check (seats_used <= seats_total)
);

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  email text,
  reflab_name text,
  first_name text,
  last_name text,
  country text,
  city text,
  association text,
  association_id uuid,
  referee_type text,
  main_role text,
  referee_role text,
  category text,
  level text,
  birth_date date,
  avatar_url text,
  ref_card_id text unique,
  ranking_display_name text,
  show_real_name_in_ranking boolean not null default false,
  public_profile boolean not null default true,
  hide_ranking_name boolean not null default false,
  preferred_sport_type text
    check (preferred_sport_type is null or preferred_sport_type in ('football_11', 'futsal')),

  -- Release-window compatibility only. Canonical access lives in
  -- user_subscriptions.
  subscription_plan text not null default 'basic'
    check (subscription_plan in ('free', 'basic', 'pro')),
  institution_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_global_roles (
  user_id text primary key,
  role_key text not null,
  source text not null default 'automatic_default',
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  plan_key text not null,
  status text not null default 'active'
    check (status in ('trialing', 'active', 'paused', 'canceled', 'expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source text not null default 'automatic_default',
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_individual_plan_check
    check (plan_key in ('basic', 'pro')),
  constraint user_subscriptions_window_check
    check (ends_at is null or ends_at > starts_at)
);

create table public.institution_subscriptions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null unique,
  plan_key text not null,
  status text not null default 'active'
    check (status in ('trialing', 'active', 'paused', 'canceled', 'expired')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  seat_limit integer check (seat_limit is null or seat_limit >= 0),
  source text not null default 'canonical_install',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_subscriptions_plan_check
    check (plan_key in ('academy', 'enterprise')),
  constraint institution_subscriptions_window_check
    check (ends_at is null or ends_at > starts_at)
);

create table public.capability_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  institution_id uuid,
  capability_key text not null,
  scope_type text not null
    check (scope_type in ('global_user', 'institution_user')),
  effect text not null check (effect in ('allow', 'deny')),
  reason text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_overrides_scope_check check (
    (scope_type = 'global_user' and institution_id is null)
    or (scope_type = 'institution_user' and institution_id is not null)
  ),
  constraint capability_overrides_window_check
    check (valid_until is null or valid_until > valid_from)
);

create table public.access_change_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  target_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(old_data) = 'object'),
  new_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(new_data) = 'object'),
  reason text,
  created_at timestamptz not null default now()
);

create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(after_state) = 'object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

-- Compatibility table. New product writes must use user_global_roles and
-- user_subscriptions.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  role text not null default 'individual_referee',
  subscription_plan text not null default 'basic'
    check (subscription_plan in ('free', 'basic', 'pro')),
  institution_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Institution tenancy, permissions, content and assessments
-- ---------------------------------------------------------------------------

create table public.institution_permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  name text not null,
  description text,
  permission_scope text not null default 'institution',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institution_roles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid,
  role_key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_assignable boolean not null default true,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_roles_id_tenant_unique unique (id, institution_id)
);

create table public.institution_role_permissions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid,
  role_id uuid not null,
  permission_id uuid not null,
  created_at timestamptz not null default now(),
  constraint institution_role_permissions_unique unique (role_id, permission_id)
);

create table public.institution_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  user_id text not null,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  primary_sport text
    check (primary_sport is null or primary_sport in ('football_11', 'futsal')),
  category text,
  joined_at timestamptz,
  invited_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  last_active_at timestamptz,
  invited_by_user_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_memberships_unique unique (institution_id, user_id),
  constraint institution_memberships_id_tenant_unique unique (id, institution_id)
);

create table public.institution_membership_roles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  constraint institution_membership_roles_unique unique (membership_id, role_id)
);

create table public.institution_membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  membership_id uuid not null,
  permission_id uuid not null,
  allowed boolean not null,
  reason text,
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_membership_permission_overrides_unique
    unique (membership_id, permission_id)
);

-- Compatibility table. New product writes must use institution_memberships.
create table public.institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  user_id text,
  role text not null default 'institutional_student',
  cohort text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.institution_cohorts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  name text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  season_label text,
  starts_on date,
  ends_on date,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_cohorts_id_tenant_unique unique (id, institution_id),
  constraint institution_cohorts_window_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.institution_groups (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  cohort_id uuid,
  name text not null,
  description text,
  group_type text not null default 'training'
    check (
      group_type in (
        'course',
        'cohort',
        'commission',
        'category',
        'role',
        'training',
        'work_team'
      )
    ),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  category text,
  starts_on date,
  ends_on date,
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_groups_name_unique unique (institution_id, name),
  constraint institution_groups_id_tenant_unique unique (id, institution_id),
  constraint institution_groups_window_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.institution_group_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  group_id uuid not null,
  membership_id uuid not null,
  group_role text not null default 'participant'
    check (group_role in ('participant', 'instructor', 'coordinator', 'observer')),
  status text not null default 'active'
    check (status in ('active', 'completed', 'removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_group_memberships_unique unique (group_id, membership_id)
);

create table public.institution_contents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  content_type text not null
    check (
      content_type in (
        'video',
        'question',
        'trivia',
        'document',
        'circular',
        'class',
        'exercise',
        'presentation',
        'pdf',
        'link',
        'audio',
        'case_study'
      )
    ),
  title text not null,
  description text,
  author_user_id text not null,
  topic text,
  subtopic text,
  rule_reference text,
  difficulty text,
  language text not null default 'es',
  valid_from date,
  valid_until date,
  source_name text,
  source_url text,
  storage_path text,
  visibility text not null default 'institution'
    check (visibility in ('private', 'institution', 'assigned_groups', 'public')),
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'archived', 'expired')),
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint institution_contents_id_tenant_unique unique (id, institution_id),
  constraint institution_contents_validity_check
    check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.institution_content_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  content_id uuid not null,
  group_id uuid,
  user_id text,
  assigned_by_user_id text not null,
  available_from timestamptz,
  due_at timestamptz,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  constraint institution_content_assignments_target_check check (
    (group_id is not null and user_id is null)
    or (group_id is null and user_id is not null)
  ),
  constraint institution_content_assignments_window_check
    check (due_at is null or available_from is null or due_at >= available_from)
);

create table public.institution_assessments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  name text not null,
  description text,
  modality text not null
    check (
      modality in (
        'video_analysis',
        'rules_exam',
        'trivia',
        'referee_exam',
        'communication',
        'var',
        'futsal',
        'psychology_orientation',
        'physical',
        'custom'
      )
    ),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'open', 'closed', 'cancelled', 'archived')),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  opens_at timestamptz,
  closes_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  question_count integer check (question_count is null or question_count > 0),
  video_count integer check (video_count is null or video_count > 0),
  attempts_allowed integer not null default 1 check (attempts_allowed > 0),
  immediate_feedback boolean not null default false,
  free_navigation boolean not null default false,
  randomize_questions boolean not null default false,
  randomize_videos boolean not null default false,
  minimum_score numeric(5,2)
    check (minimum_score is null or minimum_score between 0 and 100),
  penalty_value numeric(6,2),
  allow_review boolean not null default true,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint institution_assessments_id_tenant_unique unique (id, institution_id),
  constraint institution_assessments_window_check
    check (opens_at is null or closes_at is null or closes_at > opens_at)
);

create table public.institution_assessment_items (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  assessment_id uuid not null,
  item_type text not null
    check (
      item_type in (
        'global_clip',
        'institutional_clip',
        'rule_question',
        'institution_content',
        'manual'
      )
    ),
  source_id text,
  item_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(item_snapshot) = 'object'),
  points numeric(7,2) not null default 1 check (points >= 0),
  sort_order integer not null default 0,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.institution_assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  assessment_id uuid not null,
  group_id uuid,
  user_id text,
  assigned_by_user_id text not null,
  assigned_at timestamptz not null default now(),
  opens_at_override timestamptz,
  closes_at_override timestamptz,
  attempts_override integer check (attempts_override is null or attempts_override > 0),
  status text not null default 'assigned'
    check (status in ('assigned', 'cancelled', 'completed')),
  constraint institution_assessment_assignments_id_tenant_assessment_unique
    unique (id, institution_id, assessment_id),
  constraint institution_assessment_assignments_target_check check (
    (group_id is not null and user_id is null)
    or (group_id is null and user_id is not null)
  ),
  constraint institution_assessment_assignments_window_check check (
    opens_at_override is null
    or closes_at_override is null
    or closes_at_override > opens_at_override
  )
);

create table public.institution_assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  assessment_id uuid not null,
  assignment_id uuid not null,
  group_id uuid,
  user_id text not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'submitted',
        'graded',
        'expired',
        'cancelled'
      )
    ),
  started_at timestamptz,
  submitted_at timestamptz,
  graded_at timestamptz,
  score numeric(7,2),
  percentage numeric(5,2)
    check (percentage is null or percentage between 0 and 100),
  passed boolean,
  time_spent_seconds integer
    check (time_spent_seconds is null or time_spent_seconds >= 0),
  result_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_assessment_sessions_id_tenant_unique
    unique (id, institution_id),
  constraint institution_assessment_sessions_unique
    unique (assignment_id, user_id, attempt_number)
);

create table public.institution_assessment_feedback (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  session_id uuid not null,
  author_user_id text not null,
  action text not null
    check (
      action in (
        'comment',
        'approve',
        'fail',
        'request_retry',
        'mark_for_review',
        'assign_activity'
      )
    ),
  comment text,
  attachment_url text,
  audio_url text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now()
);

create table public.institution_assessment_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  assessment_id uuid not null,
  actor_user_id text,
  action text not null,
  snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create table public.institution_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  title text not null,
  message text not null,
  notification_type text not null default 'institutional_notice',
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  channels text[] not null default array['web']::text[]
    check (
      cardinality(channels) > 0
      and channels <@ array['web', 'pwa', 'email', 'push']::text[]
    ),
  scheduled_for timestamptz,
  expires_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  deduplication_key text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_notification_campaigns_id_tenant_unique
    unique (id, institution_id)
);

create table public.institution_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  campaign_id uuid not null,
  user_id text not null,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'read', 'dismissed')),
  sent_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_notification_recipients_unique unique (campaign_id, user_id)
);

create table public.institution_data_consents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  membership_id uuid not null,
  user_id text not null,
  data_category text not null
    check (
      data_category in (
        'availability',
        'readiness_summary',
        'physical_load',
        'physical_detail',
        'medical_notes',
        'psychology_compliance',
        'psychology_detail',
        'post_match_review'
      )
    ),
  share_summary boolean not null default false,
  share_detail boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_data_consents_unique unique (membership_id, data_category)
);

create table public.institution_audit_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid,
  actor_user_id text,
  actor_membership_id uuid,
  action text not null,
  scope_type text not null default 'institution',
  entity_type text not null,
  entity_id text,
  request_id text,
  ip_hash text,
  before_state jsonb
    check (before_state is null or jsonb_typeof(before_state) = 'object'),
  after_state jsonb
    check (after_state is null or jsonb_typeof(after_state) = 'object'),
  reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.institution_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  user_id text not null,
  simulated_role_key text not null,
  status text not null default 'active'
    check (status in ('active', 'ended', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  constraint institution_demo_sessions_expiry_check check (expires_at > started_at)
);

-- ---------------------------------------------------------------------------
-- Fixtures, appointments and match preparation
-- ---------------------------------------------------------------------------

create table public.referee_roles (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  role_key text not null,
  label text not null,
  role_group text,
  requires_var boolean not null default false,
  is_reserve boolean not null default false,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referee_roles_sport_key_unique unique (sport_type, role_key)
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  country_id uuid,
  association_id uuid,
  competition_id uuid,
  season_id uuid,
  category_id uuid,
  home_team_id uuid,
  away_team_id uuid,
  venue_id uuid,
  kickoff_at timestamptz not null,
  round_label text,
  matchday_number integer,
  status text not null default 'scheduled'
    check (
      status in (
        'scheduled',
        'confirmed',
        'live',
        'completed',
        'postponed',
        'suspended',
        'cancelled'
      )
    ),
  referee_system text,
  var_enabled boolean not null default false,
  data_source text not null default 'manual'
    check (data_source in ('institutional', 'api', 'manual')),
  provider text,
  external_id text,
  raw_source_reference jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_source_reference) = 'object'),
  notes text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixtures_distinct_teams_check
    check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);

create table public.fixture_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  country_name text not null,
  competition_id uuid,
  date_from date not null,
  date_to date not null,
  sync_status text not null
    check (sync_status in ('success', 'partial', 'error', 'skipped')),
  message text,
  fixtures_upserted integer not null default 0 check (fixtures_upserted >= 0),
  competitions_upserted integer not null default 0 check (competitions_upserted >= 0),
  teams_upserted integer not null default 0 check (teams_upserted >= 0),
  venues_upserted integer not null default 0 check (venues_upserted >= 0),
  error_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(error_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixture_sync_logs_date_window_check check (date_to >= date_from)
);

create table public.referee_eligibility (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  institution_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  country_id uuid,
  association_id uuid,
  competition_id uuid,
  category_id uuid,
  role_id uuid not null,
  eligibility_mode text not null default 'eligible'
    check (eligibility_mode in ('eligible', 'view_only', 'blocked')),
  allow_lower_categories boolean not null default false,
  allow_higher_categories boolean not null default false,
  source_type text not null default 'profile'
    check (source_type in ('profile', 'institutional', 'admin', 'system')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  fixture_id uuid not null,
  role_id uuid not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  competition_id uuid,
  association_id uuid,
  institution_id uuid,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'institutional', 'api')),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'pending_confirmation',
        'confirmed',
        'modified',
        'replaced',
        'cancelled',
        'suspended',
        'postponed',
        'completed'
      )
    ),
  created_by_user_id text,
  confirmed_at timestamptz,
  observations text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  replaced_by_appointment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  user_id text not null,
  changed_by_user_id text,
  change_type text not null default 'created'
    check (
      change_type in (
        'created',
        'status_changed',
        'role_changed',
        'fixture_changed',
        'note_updated',
        'system_sync'
      )
    ),
  from_status text,
  to_status text,
  reason text,
  snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create table public.match_officials (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null,
  role_id uuid not null,
  appointment_id uuid,
  user_id text,
  official_name text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'institutional', 'api')),
  status text not null default 'assigned'
    check (status in ('assigned', 'confirmed', 'replaced', 'removed')),
  is_primary_assignment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  provider text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'institutional', 'api')),
  snapshot_type text not null
    check (snapshot_type in ('standings', 'form', 'disciplinary', 'official_note', 'summary')),
  period_label text,
  updated_source_at timestamptz,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_preparations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  user_id text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  stage text not null check (stage in ('72_48_hours', '24_hours', 'matchday')),
  status text not null default 'draft' check (status in ('draft', 'completed')),
  technical_focus text,
  physical_focus text,
  communication_focus text,
  psychological_focus text,
  checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array'),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_preparations_stage_unique unique (appointment_id, stage)
);

create table public.post_match_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique,
  user_id text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  result_summary text,
  minutes_played integer
    check (minutes_played is null or minutes_played between 0 and 180),
  incidents jsonb not null default '[]'::jsonb
    check (jsonb_typeof(incidents) = 'array'),
  key_decisions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(key_decisions) = 'array'),
  perceived_load integer
    check (perceived_load is null or perceived_load between 1 and 10),
  fatigue_score integer
    check (fatigue_score is null or fatigue_score between 1 and 10),
  soreness text,
  emotional_state text,
  strengths text[] not null default '{}',
  perceived_errors text[] not null default '{}',
  situations_to_review text[] not null default '{}',
  notes text,
  closure_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Training content, official library and assessment evidence
-- ---------------------------------------------------------------------------

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  title text not null,
  description text,
  video_url text not null,
  topic text not null,
  subtopic text,
  sub_type text,
  decision_detail text,
  category text,
  module text,
  type text,
  training_type text,
  difficulty text not null,
  mode text not null default 'field'
    check (mode in ('field', 'var', 'english', 'exam', 'training')),
  correct_foul boolean,
  correct_restart text,
  correct_discipline text,
  correct_var boolean,
  incident_type text,
  correct_clear_error text
    check (
      correct_clear_error is null
      or correct_clear_error in ('yes', 'no', 'unclear')
    ),
  correct_app_status text
    check (
      correct_app_status is null
      or correct_app_status in ('same_app', 'new_app', 'not_relevant')
    ),
  correct_var_decision text
    check (
      correct_var_decision is null
      or correct_var_decision in ('check_complete', 'recommend_ofr', 'factual_review')
    ),
  explanation text,
  rule_reference text,
  season text,
  source_version text,
  source_official text,
  governing_body text,
  technical_resolution text,
  disciplinary_resolution text,
  normative_status text,
  language text,
  reviewed_at timestamptz,
  analysis_answers jsonb,
  is_active boolean not null default true,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clips_analysis_answers_object_check
    check (analysis_answers is null or jsonb_typeof(analysis_answers) = 'object')
);

create table public.institutional_clips (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid,
  uploaded_by text not null,
  source_url text,
  storage_path text,
  original_filename text,
  title text not null,
  description text,
  match_context text,
  incident_minute text,
  category text,
  topic text,
  correct_decision text,
  correct_restart text,
  correct_discipline text,
  final_expected_answer text,
  explanation text,
  ifab_var_criteria text,
  difficulty text,
  mode text not null default 'institutional_video',
  is_public boolean not null default false,
  status text not null default 'uploaded'
    check (
      status in (
        'uploaded',
        'under_review',
        'processing',
        'approved',
        'rejected',
        'published'
      )
    ),
  review_notes text,

  -- Reconciled fields consumed by active APIs.
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  subtopic text,
  rule_reference text,
  season text,
  source_version text,
  source_official text,
  governing_body text,
  technical_resolution text,
  disciplinary_resolution text,
  normative_status text,
  language text,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ifab_library_documents (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  governing_body text not null check (governing_body in ('IFAB', 'FIFA')),
  title text not null,
  category text not null
    check (
      category in (
        'reglas',
        'circular',
        'resumen',
        'protocolo_var',
        'cambios_reglamentarios',
        'mundial',
        'material_consulta'
      )
    ),
  language text not null default 'es',
  season text,
  source_version text,
  source_official text,
  effective_date date,
  published_at date,
  reviewed_at timestamptz,
  status text not null default 'vigente'
    check (status in ('vigente', 'proxima_actualizacion', 'archivado')),
  summary text,
  file_url text,
  storage_path text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifab_library_documents_sport_body_check check (
    (sport_type = 'football_11' and governing_body = 'IFAB')
    or (sport_type = 'futsal' and governing_body = 'FIFA')
  ),
  constraint ifab_library_documents_current_source_check check (
    status <> 'vigente'
    or (source_official is not null and btrim(source_official) <> '')
  )
);

create table public.psychology_modules (
  slug text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referee_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  submission_id uuid not null,
  context_type text not null check (context_type in ('individual', 'institutional')),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  activity_type text not null check (activity_type = 'referee_exam'),
  season text,
  source_version text,
  institution_id uuid,
  institution_group_id uuid,
  institution_assessment_session_id uuid,
  item_manifest jsonb not null
    check (jsonb_typeof(item_manifest) = 'array'),
  manifest_hash text not null
    check (manifest_hash ~ '^[0-9a-f]{64}$'),
  item_count integer not null check (item_count between 1 and 100),
  status text not null default 'active'
    check (status in ('created', 'active', 'submitted', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  constraint referee_exam_sessions_user_submission_unique
    unique (user_id, submission_id),
  constraint referee_exam_sessions_item_count_check
    check (item_count = jsonb_array_length(item_manifest)),
  constraint referee_exam_sessions_expiry_check
    check (expires_at > started_at),
  constraint referee_exam_sessions_context_check check (
    (
      context_type = 'individual'
      and institution_id is null
      and institution_group_id is null
      and institution_assessment_session_id is null
    )
    or (
      context_type = 'institutional'
      and institution_id is not null
      and institution_assessment_session_id is not null
    )
  )
);

create table public.exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  exam_session_id uuid not null unique,
  submission_id uuid not null,
  payload_hash text not null
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  activity_type text not null,
  season text,
  source_version text,
  ref_card_id text,
  institution_id uuid,
  institution_group_id uuid,
  institution_assessment_session_id uuid,
  total_questions integer not null check (total_questions between 1 and 100),
  total_score numeric(10,2) not null check (total_score >= 0),
  avg_score numeric(5,2) not null check (avg_score between 0 and 100),
  correct_count integer not null check (correct_count between 0 and total_questions),
  details jsonb not null default '[]'::jsonb
    check (jsonb_typeof(details) = 'array'),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint exam_results_user_submission_unique unique (user_id, submission_id)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  activity_type text,
  ref_card_id text,
  exam_result_id uuid,
  submission_id uuid,

  -- Legacy content reference retained for compatibility with active readers.
  clip_id text,
  clip_title text,

  source_item_type text,
  source_item_id text,
  source_occurrence_id uuid,
  module text,
  mode text,
  topic text,
  subtopic text,
  rule_reference text,
  season text,
  source_version text,
  difficulty text,
  score numeric(7,2),
  is_correct boolean,
  selected_decision text,
  correct_decision text,
  selected_restart text,
  correct_restart text,
  selected_discipline text,
  correct_discipline text,
  foul boolean,
  restart text,
  discipline text,
  technical_correct boolean,
  restart_correct boolean,

  -- Compatibility spelling. New metrics use disciplinary_correct.
  discipline_correct boolean,
  disciplinary_correct boolean,
  subtype_correct boolean,
  accumulated_foul_correct boolean,
  four_second_correct boolean,
  goalkeeper_correct boolean,
  justification_correct boolean,
  var_correct boolean,
  app_correct boolean,
  ofr_correct boolean,
  var_intervention_correct boolean,
  factual_vs_interpretative_correct boolean,
  final_decision_correct boolean,
  criterion_result jsonb
    check (criterion_result is null or jsonb_typeof(criterion_result) = 'object'),
  feedback text,
  answer_text text,
  time_spent integer check (time_spent is null or time_spent >= 0),
  time_spent_seconds integer check (time_spent_seconds is null or time_spent_seconds >= 0),

  english_score integer check (english_score is null or english_score between 0 and 100),
  communication_score integer
    check (communication_score is null or communication_score between 0 and 100),
  vocabulary_score integer
    check (vocabulary_score is null or vocabulary_score between 0 and 100),
  clarity_score integer check (clarity_score is null or clarity_score between 0 and 100),
  terminology_score integer
    check (terminology_score is null or terminology_score between 0 and 100),
  grammar_score integer check (grammar_score is null or grammar_score between 0 and 100),
  technical_accuracy_score integer
    check (technical_accuracy_score is null or technical_accuracy_score between 0 and 100),
  pronunciation_score integer
    check (pronunciation_score is null or pronunciation_score between 0 and 100),
  structure_score integer
    check (structure_score is null or structure_score between 0 and 100),
  protocol_score integer check (protocol_score is null or protocol_score between 0 and 100),
  justification_score integer
    check (justification_score is null or justification_score between 0 and 100),
  communication_mode text,
  global_communication_label text,
  vocabulary_level text,
  mastered_concepts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(mastered_concepts) = 'array'),
  pending_concepts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pending_concepts) = 'array'),

  workout_name text,
  total_duration integer check (total_duration is null or total_duration >= 0),
  completed_rounds integer check (completed_rounds is null or completed_rounds >= 0),
  total_rounds integer check (total_rounds is null or total_rounds >= 0),
  completed boolean,
  perceived_effort integer
    check (perceived_effort is null or perceived_effort between 1 and 10),
  fatigue_level integer
    check (fatigue_level is null or fatigue_level between 1 and 10),
  notes text,

  institution_id uuid,
  institution_group_id uuid,
  institution_assessment_session_id uuid,
  created_at timestamptz not null default now(),
  constraint attempts_source_reference_check check (
    (source_item_type is null and source_item_id is null and source_occurrence_id is null)
    or (
      source_item_type is not null
      and source_item_id is not null
      and source_occurrence_id is not null
    )
  ),
  constraint attempts_source_type_check check (
    source_item_type is null
    or source_item_type in (
      'global_clip',
      'institutional_clip',
      'rule_question',
      'manual'
    )
  ),
  constraint attempts_exam_source_check check (
    exam_result_id is null
    or (
      source_item_type is not null
      and source_item_id is not null
      and source_occurrence_id is not null
    )
  )
);

create table public.rules_exam_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  activity_type text not null default 'rules_exam',
  season text,
  source_version text,
  total_questions integer not null check (total_questions > 0),
  correct_count integer not null check (correct_count between 0 and total_questions),
  percentage numeric(5,2) not null check (percentage between 0 and 100),
  unanswered_count integer not null default 0
    check (unanswered_count between 0 and total_questions),
  finish_reason text,
  level text,
  details jsonb not null default '[]'::jsonb
    check (jsonb_typeof(details) = 'array'),
  topic_performance jsonb not null default '[]'::jsonb
    check (jsonb_typeof(topic_performance) = 'array'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ref Performance and Psychology
-- ---------------------------------------------------------------------------

create table public.performance_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  referee_role_key text,
  date date not null default current_date,
  checkin_type text not null default 'pre'
    check (checkin_type in ('pre', 'post', 'rest_day')),
  has_match_today boolean not null default false,
  has_training_today boolean not null default false,
  activity_type text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  rpe integer check (rpe is null or rpe between 1 and 10),
  fatigue integer check (fatigue is null or fatigue between 1 and 10),
  sleep_quality text,
  sleep_hours numeric(4,2)
    check (sleep_hours is null or sleep_hours between 0 and 24),
  soreness text,
  emotional_state text,
  emotional_score integer
    check (emotional_score is null or emotional_score between 1 and 10),
  readiness_score integer
    check (readiness_score is null or readiness_score between 0 and 100),
  readiness_status text,
  completed boolean,
  recovery_mobility boolean,
  internal_load integer check (internal_load is null or internal_load >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.performance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_id uuid,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  referee_role_key text,
  session_date date not null default current_date,
  session_type text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  rpe integer check (rpe is null or rpe between 1 and 10),
  internal_load integer check (internal_load is null or internal_load >= 0),
  fatigue_post integer check (fatigue_post is null or fatigue_post between 1 and 10),
  soreness_post text,
  completed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wellness_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_id uuid,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  referee_role_key text,
  date date not null default current_date,
  sleep_quality text,
  sleep_hours numeric(4,2)
    check (sleep_hours is null or sleep_hours between 0 and 24),
  fatigue integer check (fatigue is null or fatigue between 1 and 10),
  soreness text,
  emotional_state text,
  emotional_score integer
    check (emotional_score is null or emotional_score between 1 and 10),
  recovery_mobility boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.readiness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_id uuid,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  referee_role_key text,
  score integer not null check (score between 0 and 100),
  status text,
  factors jsonb
    check (factors is null or jsonb_typeof(factors) = 'object'),
  created_at timestamptz not null default now()
);

create table public.physical_tests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  test_type text not null,
  score numeric,
  unit text,
  gender_category text,
  target_value numeric,
  notes text,
  test_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.psychology_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  module_slug text not null,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  referee_role_key text,
  checkin_type text not null default 'pre_match'
    check (checkin_type in ('pre_match', 'post_match', 'error_recovery')),
  match_context text,
  pressure_source text,
  focus_goal text,
  reset_cue text,
  incident_minute integer
    check (incident_minute is null or incident_minute between 0 and 130),
  incident_summary text,
  error_factors text[] not null default '{}',
  learning text,
  next_action text,
  activation_score integer
    check (activation_score is null or activation_score between 1 and 10),
  confidence_score integer
    check (confidence_score is null or confidence_score between 1 and 10),
  pressure_score integer
    check (pressure_score is null or pressure_score between 1 and 10),
  concentration_score integer
    check (concentration_score is null or concentration_score between 1 and 10),
  emotional_control_score integer
    check (emotional_control_score is null or emotional_control_score between 1 and 10),
  mental_fatigue_score integer
    check (mental_fatigue_score is null or mental_fatigue_score between 1 and 10),
  error_impact_score integer
    check (error_impact_score is null or error_impact_score between 1 and 10),
  recovery_score integer
    check (recovery_score is null or recovery_score between 1 and 10),
  process_orientation_score integer
    check (process_orientation_score is null or process_orientation_score between 1 and 10),
  mental_score integer
    check (mental_score is null or mental_score between 0 and 100),
  mental_status text,
  feedback jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feedback) = 'object'),
  responses jsonb not null default '{}'::jsonb
    check (jsonb_typeof(responses) = 'object'),
  source_documents text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.psychology_wellbeing_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  module_slug text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  week_start date not null default current_date,
  week_context text,
  emotional_exhaustion_score integer
    check (emotional_exhaustion_score is null or emotional_exhaustion_score between 1 and 10),
  cynicism_score integer
    check (cynicism_score is null or cynicism_score between 1 and 10),
  motivation_score integer
    check (motivation_score is null or motivation_score between 1 and 10),
  sleep_disruption_score integer
    check (sleep_disruption_score is null or sleep_disruption_score between 1 and 10),
  concentration_difficulty_score integer
    check (concentration_difficulty_score is null or concentration_difficulty_score between 1 and 10),
  external_pressure_score integer
    check (external_pressure_score is null or external_pressure_score between 1 and 10),
  institutional_support_score integer
    check (institutional_support_score is null or institutional_support_score between 1 and 10),
  violence_exposure_score integer
    check (violence_exposure_score is null or violence_exposure_score between 1 and 10),
  recovery_quality_score integer
    check (recovery_quality_score is null or recovery_quality_score between 1 and 10),
  workload_score integer
    check (workload_score is null or workload_score between 1 and 10),
  burnout_risk_score integer
    check (burnout_risk_score is null or burnout_risk_score between 0 and 100),
  burnout_risk_level text,
  stressors text[] not null default '{}',
  protective_factors text[] not null default '{}',
  feedback jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feedback) = 'object'),
  notes text,
  source_documents text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.psychology_exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  module_slug text not null,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  referee_role_key text,
  exercise_type text not null
    check (exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')),
  scenario_id text,
  scenario_title text,
  pressure_level integer
    check (pressure_level is null or pressure_level between 1 and 10),
  before_score integer check (before_score is null or before_score between 1 and 10),
  after_score integer check (after_score is null or after_score between 1 and 10),
  clarity_score integer check (clarity_score is null or clarity_score between 1 and 10),
  response_strategy text,
  internal_dialogue_before text,
  internal_dialogue_after text,
  communication_phrase text,
  action_plan text,
  feedback jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feedback) = 'object'),
  notes text,
  source_documents text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RefLab Coach evidence and usage ledger
-- ---------------------------------------------------------------------------

create table public.coach_rate_limit_buckets (
  user_id text not null,
  feature text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

create table public.coach_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  institution_id uuid,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  feature text not null
    check (
      feature in (
        'technical_feedback',
        'exam_analysis',
        'communication_feedback',
        'var_feedback',
        'coach_conversation'
      )
    ),
  prompt_version text not null,
  model_provider text not null,
  model_name text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  input_digest text not null,
  output_digest text,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  confidence_label text not null
    check (confidence_label in ('high', 'medium', 'human_review')),
  confidence_score integer not null check (confidence_score between 0 and 100),
  requires_human_review boolean not null default false,
  provider_response_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.coach_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  evidence_type text not null
    check (evidence_type in ('clip', 'attempt', 'exam', 'official_document', 'metric_snapshot')),
  source_table text not null,
  source_id text not null,
  title text not null,
  authority text,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  rule_reference text,
  source_version text,
  official_url text,
  is_official boolean not null default false,
  normative_status text,
  reviewed_at timestamptz,
  evidence_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence_snapshot) = 'object'),
  created_at timestamptz not null default now()
);

create table public.coach_data_consents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  data_category text not null
    check (
      data_category in (
        'technical_history',
        'match_operational',
        'physical_summary',
        'psychology_summary',
        'psychology_detail',
        'medical_sensitive'
      )
    ),
  purpose text not null
    check (purpose in ('personal_coaching', 'institutional_sharing', 'model_improvement')),
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_data_consents_user_category_purpose_unique
    unique (user_id, data_category, purpose),
  constraint coach_data_consents_dates_check check (
    (granted and granted_at is not null and revoked_at is null)
    or (not granted)
  )
);

create table public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  user_id text not null,
  feature text not null,
  model_provider text not null,
  model_name text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12,6)
    check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CRM and notifications
-- ---------------------------------------------------------------------------

create table public.institutional_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  role text,
  institution_name text not null,
  institution_type text,
  country text,
  city text,
  referee_count integer check (referee_count is null or referee_count >= 0),
  instructor_count integer check (instructor_count is null or instructor_count >= 0),
  email text not null,
  whatsapp text,
  interest_areas text[] not null default '{}',
  interest text,
  source text,
  message text,
  potential_plan text not null default 'academy'
    check (potential_plan in ('academy', 'enterprise')),
  status text not null default 'new'
    check (
      status in (
        'new',
        'contacted',
        'demo_scheduled',
        'demo_completed',
        'proposal_sent',
        'negotiation',
        'won',
        'lost',
        'archived'
      )
    ),
  owner_user_id text,
  next_contact_at timestamptz,
  notes text,
  lost_reason text,
  archived_at timestamptz,
  converted_institution_id uuid,
  converted_at timestamptz,
  converted_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institutional_leads_conversion_check check (
    (converted_institution_id is null and converted_at is null)
    or (converted_institution_id is not null and converted_at is not null)
  )
);

create table public.institutional_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  actor_user_id text not null,
  activity_type text not null
    check (
      activity_type in (
        'created',
        'updated',
        'status_changed',
        'note_added',
        'contact_logged',
        'archived',
        'restored',
        'converted',
        'deleted'
      )
    ),
  note text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id text primary key,
  training_enabled boolean not null default true,
  exams_enabled boolean not null default true,
  evolution_enabled boolean not null default true,
  matches_enabled boolean not null default true,
  new_content_enabled boolean not null default true,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  token text not null unique,
  provider text not null default 'fcm',
  user_agent text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  appointment_id uuid,
  fixture_id uuid,
  sport_type text check (sport_type is null or sport_type in ('football_11', 'futsal')),
  type text not null,
  category text not null,
  title text not null,
  message text not null,
  action_label text not null,
  action_url text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  error text,
  deduplication_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Deferred foreign keys
-- ---------------------------------------------------------------------------

alter table public.plan_capabilities
  add constraint plan_capabilities_plan_fk
    foreign key (plan_key) references public.access_plans(plan_key) on delete cascade,
  add constraint plan_capabilities_capability_fk
    foreign key (capability_key) references public.capabilities(capability_key) on delete cascade;

alter table public.associations
  add constraint associations_country_fk
    foreign key (country_id) references public.countries(id) on delete set null;

alter table public.competitions
  add constraint competitions_association_fk
    foreign key (association_id) references public.associations(id) on delete cascade;

alter table public.competition_seasons
  add constraint competition_seasons_competition_fk
    foreign key (competition_id) references public.competitions(id) on delete cascade;

alter table public.competition_categories
  add constraint competition_categories_competition_fk
    foreign key (competition_id) references public.competitions(id) on delete cascade,
  add constraint competition_categories_season_fk
    foreign key (season_id) references public.competition_seasons(id) on delete cascade;

alter table public.teams
  add constraint teams_country_fk
    foreign key (country_id) references public.countries(id) on delete set null,
  add constraint teams_association_fk
    foreign key (association_id) references public.associations(id) on delete set null;

alter table public.venues
  add constraint venues_country_fk
    foreign key (country_id) references public.countries(id) on delete set null,
  add constraint venues_association_fk
    foreign key (association_id) references public.associations(id) on delete set null;

alter table public.user_profiles
  add constraint user_profiles_association_fk
    foreign key (association_id) references public.associations(id) on delete set null,
  add constraint user_profiles_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null;

alter table public.user_global_roles
  add constraint user_global_roles_role_fk
    foreign key (role_key) references public.platform_roles(role_key);

alter table public.user_subscriptions
  add constraint user_subscriptions_plan_fk
    foreign key (plan_key) references public.access_plans(plan_key);

alter table public.institution_subscriptions
  add constraint institution_subscriptions_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_subscriptions_plan_fk
    foreign key (plan_key) references public.access_plans(plan_key);

alter table public.capability_overrides
  add constraint capability_overrides_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint capability_overrides_capability_fk
    foreign key (capability_key) references public.capabilities(capability_key) on delete cascade;

alter table public.user_roles
  add constraint user_roles_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null;

alter table public.institution_roles
  add constraint institution_roles_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_role_permissions
  add constraint institution_role_permissions_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_role_permissions_role_fk
    foreign key (role_id) references public.institution_roles(id) on delete cascade,
  add constraint institution_role_permissions_permission_fk
    foreign key (permission_id) references public.institution_permissions(id) on delete cascade;

alter table public.institution_memberships
  add constraint institution_memberships_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_membership_roles
  add constraint institution_membership_roles_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_membership_roles_membership_fk
    foreign key (membership_id, institution_id)
    references public.institution_memberships(id, institution_id) on delete cascade,
  add constraint institution_membership_roles_role_fk
    foreign key (role_id) references public.institution_roles(id) on delete cascade;

alter table public.institution_membership_permission_overrides
  add constraint institution_permission_overrides_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_permission_overrides_membership_fk
    foreign key (membership_id, institution_id)
    references public.institution_memberships(id, institution_id) on delete cascade,
  add constraint institution_permission_overrides_permission_fk
    foreign key (permission_id) references public.institution_permissions(id) on delete cascade;

alter table public.institution_members
  add constraint institution_members_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_cohorts
  add constraint institution_cohorts_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_groups
  add constraint institution_groups_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_groups_cohort_fk
    foreign key (cohort_id, institution_id)
    references public.institution_cohorts(id, institution_id) on delete restrict;

alter table public.institution_group_memberships
  add constraint institution_group_memberships_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_group_memberships_group_fk
    foreign key (group_id, institution_id)
    references public.institution_groups(id, institution_id) on delete cascade,
  add constraint institution_group_memberships_membership_fk
    foreign key (membership_id, institution_id)
    references public.institution_memberships(id, institution_id) on delete cascade;

alter table public.institution_contents
  add constraint institution_contents_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_content_assignments
  add constraint institution_content_assignments_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_content_assignments_content_fk
    foreign key (content_id, institution_id)
    references public.institution_contents(id, institution_id) on delete cascade,
  add constraint institution_content_assignments_group_fk
    foreign key (group_id, institution_id)
    references public.institution_groups(id, institution_id) on delete cascade;

alter table public.institution_assessments
  add constraint institution_assessments_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_assessment_items
  add constraint institution_assessment_items_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_assessment_items_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.institution_assessments(id, institution_id) on delete cascade;

alter table public.institution_assessment_assignments
  add constraint institution_assessment_assignments_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_assessment_assignments_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.institution_assessments(id, institution_id) on delete cascade,
  add constraint institution_assessment_assignments_group_fk
    foreign key (group_id, institution_id)
    references public.institution_groups(id, institution_id) on delete cascade;

alter table public.institution_assessment_sessions
  add constraint institution_assessment_sessions_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_assessment_sessions_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.institution_assessments(id, institution_id) on delete cascade,
  add constraint institution_assessment_sessions_assignment_fk
    foreign key (assignment_id, institution_id, assessment_id)
    references public.institution_assessment_assignments(
      id,
      institution_id,
      assessment_id
    ) on delete cascade,
  add constraint institution_assessment_sessions_group_fk
    foreign key (group_id, institution_id)
    references public.institution_groups(id, institution_id) on delete restrict;

alter table public.institution_assessment_feedback
  add constraint institution_assessment_feedback_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_assessment_feedback_session_fk
    foreign key (session_id, institution_id)
    references public.institution_assessment_sessions(id, institution_id) on delete cascade;

alter table public.institution_assessment_history
  add constraint institution_assessment_history_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_assessment_history_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.institution_assessments(id, institution_id) on delete cascade;

alter table public.institution_notification_campaigns
  add constraint institution_notification_campaigns_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.institution_notification_recipients
  add constraint institution_notification_recipients_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_notification_recipients_campaign_fk
    foreign key (campaign_id, institution_id)
    references public.institution_notification_campaigns(id, institution_id) on delete cascade;

alter table public.institution_data_consents
  add constraint institution_data_consents_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint institution_data_consents_membership_fk
    foreign key (membership_id, institution_id)
    references public.institution_memberships(id, institution_id) on delete cascade;

alter table public.institution_audit_logs
  add constraint institution_audit_logs_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null,
  add constraint institution_audit_logs_membership_fk
    foreign key (actor_membership_id) references public.institution_memberships(id) on delete set null;

alter table public.institution_demo_sessions
  add constraint institution_demo_sessions_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade;

alter table public.fixtures
  add constraint fixtures_country_fk
    foreign key (country_id) references public.countries(id) on delete set null,
  add constraint fixtures_association_fk
    foreign key (association_id) references public.associations(id) on delete set null,
  add constraint fixtures_competition_fk
    foreign key (competition_id) references public.competitions(id) on delete set null,
  add constraint fixtures_season_fk
    foreign key (season_id) references public.competition_seasons(id) on delete set null,
  add constraint fixtures_category_fk
    foreign key (category_id) references public.competition_categories(id) on delete set null,
  add constraint fixtures_home_team_fk
    foreign key (home_team_id) references public.teams(id) on delete set null,
  add constraint fixtures_away_team_fk
    foreign key (away_team_id) references public.teams(id) on delete set null,
  add constraint fixtures_venue_fk
    foreign key (venue_id) references public.venues(id) on delete set null;

alter table public.fixture_sync_logs
  add constraint fixture_sync_logs_competition_fk
    foreign key (competition_id) references public.competitions(id) on delete set null;

alter table public.referee_eligibility
  add constraint referee_eligibility_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null,
  add constraint referee_eligibility_country_fk
    foreign key (country_id) references public.countries(id) on delete set null,
  add constraint referee_eligibility_association_fk
    foreign key (association_id) references public.associations(id) on delete set null,
  add constraint referee_eligibility_competition_fk
    foreign key (competition_id) references public.competitions(id) on delete set null,
  add constraint referee_eligibility_category_fk
    foreign key (category_id) references public.competition_categories(id) on delete set null,
  add constraint referee_eligibility_role_fk
    foreign key (role_id) references public.referee_roles(id) on delete cascade;

alter table public.appointments
  add constraint appointments_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete cascade,
  add constraint appointments_role_fk
    foreign key (role_id) references public.referee_roles(id) on delete restrict,
  add constraint appointments_competition_fk
    foreign key (competition_id) references public.competitions(id) on delete set null,
  add constraint appointments_association_fk
    foreign key (association_id) references public.associations(id) on delete set null,
  add constraint appointments_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null,
  add constraint appointments_replacement_fk
    foreign key (replaced_by_appointment_id) references public.appointments(id) on delete set null;

alter table public.appointment_history
  add constraint appointment_history_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete cascade;

alter table public.match_officials
  add constraint match_officials_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete cascade,
  add constraint match_officials_role_fk
    foreign key (role_id) references public.referee_roles(id) on delete restrict,
  add constraint match_officials_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null;

alter table public.match_context_snapshots
  add constraint match_context_snapshots_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete cascade;

alter table public.match_preparations
  add constraint match_preparations_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete cascade;

alter table public.post_match_reviews
  add constraint post_match_reviews_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete cascade;

alter table public.institutional_clips
  add constraint institutional_clips_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null;

alter table public.referee_exam_sessions
  add constraint referee_exam_sessions_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade,
  add constraint referee_exam_sessions_group_fk
    foreign key (institution_group_id) references public.institution_groups(id) on delete set null,
  add constraint referee_exam_sessions_assessment_session_fk
    foreign key (institution_assessment_session_id)
    references public.institution_assessment_sessions(id) on delete cascade;

alter table public.exam_results
  add constraint exam_results_session_fk
    foreign key (exam_session_id) references public.referee_exam_sessions(id) on delete restrict,
  add constraint exam_results_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null,
  add constraint exam_results_group_fk
    foreign key (institution_group_id) references public.institution_groups(id) on delete set null,
  add constraint exam_results_assessment_session_fk
    foreign key (institution_assessment_session_id)
    references public.institution_assessment_sessions(id) on delete set null;

alter table public.attempts
  add constraint attempts_exam_result_fk
    foreign key (exam_result_id) references public.exam_results(id) on delete cascade,
  add constraint attempts_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null,
  add constraint attempts_group_fk
    foreign key (institution_group_id) references public.institution_groups(id) on delete set null,
  add constraint attempts_assessment_session_fk
    foreign key (institution_assessment_session_id)
    references public.institution_assessment_sessions(id) on delete set null;

alter table public.performance_checkins
  add constraint performance_checkins_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint performance_checkins_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

alter table public.performance_sessions
  add constraint performance_sessions_checkin_fk
    foreign key (checkin_id) references public.performance_checkins(id) on delete set null,
  add constraint performance_sessions_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint performance_sessions_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

alter table public.wellness_logs
  add constraint wellness_logs_checkin_fk
    foreign key (checkin_id) references public.performance_checkins(id) on delete set null,
  add constraint wellness_logs_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint wellness_logs_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

alter table public.readiness_scores
  add constraint readiness_scores_checkin_fk
    foreign key (checkin_id) references public.performance_checkins(id) on delete set null,
  add constraint readiness_scores_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint readiness_scores_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

alter table public.psychology_checkins
  add constraint psychology_checkins_module_fk
    foreign key (module_slug) references public.psychology_modules(slug),
  add constraint psychology_checkins_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint psychology_checkins_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

alter table public.psychology_wellbeing_assessments
  add constraint psychology_wellbeing_module_fk
    foreign key (module_slug) references public.psychology_modules(slug);

alter table public.psychology_exercise_sessions
  add constraint psychology_exercise_module_fk
    foreign key (module_slug) references public.psychology_modules(slug),
  add constraint psychology_exercise_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint psychology_exercise_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

alter table public.coach_runs
  add constraint coach_runs_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete set null;

alter table public.coach_evidence
  add constraint coach_evidence_run_fk
    foreign key (run_id) references public.coach_runs(id) on delete cascade;

alter table public.ai_usage_ledger
  add constraint ai_usage_ledger_run_fk
    foreign key (run_id) references public.coach_runs(id) on delete cascade;

alter table public.institutional_leads
  add constraint institutional_leads_converted_institution_fk
    foreign key (converted_institution_id) references public.institutions(id) on delete set null;

alter table public.institutional_lead_activities
  add constraint institutional_lead_activities_lead_fk
    foreign key (lead_id) references public.institutional_leads(id) on delete cascade;

alter table public.notification_events
  add constraint notification_events_appointment_fk
    foreign key (appointment_id) references public.appointments(id) on delete set null,
  add constraint notification_events_fixture_fk
    foreign key (fixture_id) references public.fixtures(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Indexes and uniqueness rules
-- ---------------------------------------------------------------------------

create unique index institutions_slug_unique
  on public.institutions (lower(slug));
create unique index institutions_domain_unique
  on public.institutions (lower(domain))
  where domain is not null and btrim(domain) <> '';
create unique index institutions_subdomain_unique
  on public.institutions (lower(subdomain))
  where subdomain is not null and btrim(subdomain) <> '';
create index institutions_plan_status_idx
  on public.institutions (plan_key, status, created_at desc)
  where deleted_at is null;
create index institutions_status_demo_idx
  on public.institutions (status, is_demo);

create index associations_country_active_idx
  on public.associations (country_id, is_active, name);
create index competitions_association_sport_idx
  on public.competitions (association_id, sport_type, is_active);
create unique index competitions_provider_external_unique
  on public.competitions (provider, external_id)
  where provider is not null and external_id is not null;
create index competition_seasons_competition_idx
  on public.competition_seasons (competition_id, status);
create unique index competition_seasons_provider_external_unique
  on public.competition_seasons (provider, external_id)
  where provider is not null and external_id is not null;
create index competition_categories_competition_idx
  on public.competition_categories (competition_id, sport_type, is_active);
create unique index competition_categories_provider_external_unique
  on public.competition_categories (provider, external_id)
  where provider is not null and external_id is not null;
create index teams_sport_name_idx
  on public.teams (sport_type, name);
create unique index teams_provider_external_unique
  on public.teams (provider, external_id)
  where provider is not null and external_id is not null;
create index venues_name_idx
  on public.venues (name);
create unique index venues_provider_external_unique
  on public.venues (provider, external_id)
  where provider is not null and external_id is not null;

create index user_profiles_association_id_idx
  on public.user_profiles (association_id);
create index user_profiles_subscription_plan_idx
  on public.user_profiles (subscription_plan);
create index user_global_roles_role_idx
  on public.user_global_roles (role_key);
create index user_subscriptions_plan_status_idx
  on public.user_subscriptions (plan_key, status, ends_at);
create index institution_subscriptions_plan_status_idx
  on public.institution_subscriptions (plan_key, status, ends_at);
create unique index capability_overrides_unique_scope
  on public.capability_overrides (
    user_id,
    scope_type,
    coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid),
    capability_key
  );
create index capability_overrides_user_validity_idx
  on public.capability_overrides (user_id, valid_from, valid_until);
create index access_change_audit_target_created_idx
  on public.access_change_audit (target_user_id, created_at desc);
create index access_change_audit_actor_created_idx
  on public.access_change_audit (actor_user_id, created_at desc);
create index platform_audit_entity_created_idx
  on public.platform_audit_logs (entity_type, entity_id, created_at desc);
create index platform_audit_actor_created_idx
  on public.platform_audit_logs (actor_user_id, created_at desc);
create index user_roles_institution_idx
  on public.user_roles (institution_id, role);

create unique index institution_roles_system_key_unique
  on public.institution_roles (role_key)
  where institution_id is null;
create unique index institution_roles_tenant_key_unique
  on public.institution_roles (institution_id, role_key)
  where institution_id is not null;
create index institution_memberships_tenant_status_idx
  on public.institution_memberships (institution_id, status, user_id);
create index institution_memberships_user_status_idx
  on public.institution_memberships (user_id, status, institution_id);
create index institution_membership_roles_tenant_idx
  on public.institution_membership_roles (institution_id, membership_id);
create index institution_permission_overrides_tenant_idx
  on public.institution_membership_permission_overrides (institution_id, membership_id);
create index institution_members_legacy_user_idx
  on public.institution_members (user_id, institution_id);
create index institution_cohorts_tenant_status_idx
  on public.institution_cohorts (institution_id, status);
create index institution_groups_tenant_status_idx
  on public.institution_groups (institution_id, status, sport_type);
create index institution_group_memberships_member_idx
  on public.institution_group_memberships (membership_id, status);
create index institution_contents_tenant_status_idx
  on public.institution_contents (institution_id, status, sport_type, created_at desc);
create index institution_content_assignments_group_idx
  on public.institution_content_assignments (group_id, due_at);
create index institution_content_assignments_user_idx
  on public.institution_content_assignments (user_id, due_at);
create index institution_assessments_tenant_status_idx
  on public.institution_assessments (institution_id, status, sport_type);
create index institution_assessment_items_assessment_idx
  on public.institution_assessment_items (assessment_id, sort_order);
create index institution_assessment_assignments_group_idx
  on public.institution_assessment_assignments (group_id, status);
create index institution_assessment_assignments_user_idx
  on public.institution_assessment_assignments (user_id, status);
create index institution_assessment_sessions_user_idx
  on public.institution_assessment_sessions (user_id, status, created_at desc);
create index institution_assessment_sessions_tenant_group_idx
  on public.institution_assessment_sessions (institution_id, group_id, status);
create index institution_assessment_feedback_session_idx
  on public.institution_assessment_feedback (session_id, created_at);
create index institution_assessment_history_assessment_idx
  on public.institution_assessment_history (assessment_id, created_at desc);
create index institution_notification_campaigns_status_idx
  on public.institution_notification_campaigns (institution_id, status, scheduled_for);
create index institution_notification_recipients_user_idx
  on public.institution_notification_recipients (user_id, delivery_status);
create index institution_data_consents_user_idx
  on public.institution_data_consents (user_id, institution_id);
create index institution_audit_logs_tenant_created_idx
  on public.institution_audit_logs (institution_id, created_at desc);
create index institution_demo_sessions_user_status_idx
  on public.institution_demo_sessions (user_id, status, expires_at);

create index referee_roles_sport_order_idx
  on public.referee_roles (sport_type, display_order);
create index fixtures_sport_kickoff_idx
  on public.fixtures (sport_type, kickoff_at desc);
create index fixtures_competition_status_idx
  on public.fixtures (competition_id, status, kickoff_at desc);
create unique index fixtures_provider_external_unique
  on public.fixtures (provider, external_id)
  where provider is not null and external_id is not null;
create index fixture_sync_logs_provider_created_idx
  on public.fixture_sync_logs (provider, created_at desc);
create index referee_eligibility_user_sport_idx
  on public.referee_eligibility (user_id, sport_type, is_active);
create unique index appointments_user_fixture_role_active_idx
  on public.appointments (user_id, fixture_id, role_id)
  where status not in ('cancelled', 'replaced');
create index appointments_user_status_idx
  on public.appointments (user_id, status, created_at desc);
create index appointments_fixture_idx
  on public.appointments (fixture_id, created_at desc);
create index appointment_history_appointment_idx
  on public.appointment_history (appointment_id, created_at desc);
create index match_officials_fixture_idx
  on public.match_officials (fixture_id, status);
create index match_context_snapshots_fixture_type_idx
  on public.match_context_snapshots (fixture_id, snapshot_type, created_at desc);
create index match_preparations_appointment_idx
  on public.match_preparations (appointment_id, stage);
create index post_match_reviews_user_created_idx
  on public.post_match_reviews (user_id, created_at desc);

create index clips_sport_topic_idx
  on public.clips (sport_type, topic, is_active);
create index clips_mode_created_idx
  on public.clips (mode, created_at desc);
create index institutional_clips_institution_status_idx
  on public.institutional_clips (institution_id, status, created_at desc);
create index institutional_clips_sport_topic_idx
  on public.institutional_clips (sport_type, topic);
create index ifab_library_documents_sport_status_idx
  on public.ifab_library_documents (sport_type, status, created_at desc);
create index ifab_library_documents_sport_season_idx
  on public.ifab_library_documents (sport_type, season, language);

create index referee_exam_sessions_user_status_idx
  on public.referee_exam_sessions (user_id, status, expires_at);
create index referee_exam_sessions_institution_idx
  on public.referee_exam_sessions (institution_id, status, created_at desc);
create index exam_results_user_sport_created_idx
  on public.exam_results (user_id, sport_type, created_at desc);
create unique index attempts_exam_occurrence_unique
  on public.attempts (exam_result_id, source_occurrence_id)
  where exam_result_id is not null and source_occurrence_id is not null;
create index attempts_user_sport_created_idx
  on public.attempts (user_id, sport_type, created_at desc);
create index attempts_sport_topic_created_idx
  on public.attempts (sport_type, topic, created_at desc);
create index attempts_exam_result_idx
  on public.attempts (exam_result_id, created_at);
create index rules_exam_results_user_sport_created_idx
  on public.rules_exam_results (user_id, sport_type, created_at desc);

create index performance_checkins_user_date_type_idx
  on public.performance_checkins (user_id, date, checkin_type);
create index performance_checkins_user_appointment_idx
  on public.performance_checkins (user_id, appointment_id, created_at desc);
create index performance_sessions_user_created_idx
  on public.performance_sessions (user_id, created_at desc);
create index performance_sessions_user_appointment_idx
  on public.performance_sessions (user_id, appointment_id, created_at desc);
create index wellness_logs_user_date_idx
  on public.wellness_logs (user_id, date desc);
create index wellness_logs_user_appointment_idx
  on public.wellness_logs (user_id, appointment_id, created_at desc);
create index readiness_scores_user_created_idx
  on public.readiness_scores (user_id, created_at desc);
create index readiness_scores_user_appointment_idx
  on public.readiness_scores (user_id, appointment_id, created_at desc);
create index physical_tests_user_date_idx
  on public.physical_tests (user_id, test_date desc);
create index psychology_checkins_user_module_created_idx
  on public.psychology_checkins (user_id, module_slug, created_at desc);
create index psychology_checkins_user_appointment_idx
  on public.psychology_checkins (user_id, appointment_id, created_at desc);
create index psychology_wellbeing_user_module_created_idx
  on public.psychology_wellbeing_assessments (user_id, module_slug, created_at desc);
create index psychology_exercises_user_module_created_idx
  on public.psychology_exercise_sessions (user_id, module_slug, created_at desc);
create index psychology_exercises_user_appointment_idx
  on public.psychology_exercise_sessions (user_id, appointment_id, created_at desc);

create index coach_runs_user_created_idx
  on public.coach_runs (user_id, created_at desc);
create index coach_runs_sport_feature_created_idx
  on public.coach_runs (sport_type, feature, created_at desc);
create index coach_runs_institution_created_idx
  on public.coach_runs (institution_id, created_at desc);
create index coach_evidence_run_idx
  on public.coach_evidence (run_id, created_at);
create index coach_evidence_source_idx
  on public.coach_evidence (source_table, source_id);
create index coach_data_consents_user_idx
  on public.coach_data_consents (user_id, data_category, purpose);
create index ai_usage_ledger_user_created_idx
  on public.ai_usage_ledger (user_id, created_at desc);

create index institutional_leads_pipeline_idx
  on public.institutional_leads (status, next_contact_at, created_at desc);
create index institutional_leads_owner_idx
  on public.institutional_leads (owner_user_id, status);
create index institutional_lead_activities_lead_created_idx
  on public.institutional_lead_activities (lead_id, created_at desc);
create index notification_events_user_status_idx
  on public.notification_events (user_id, status, created_at desc);
create unique index notification_events_deduplication_unique
  on public.notification_events (user_id, deduplication_key)
  where deduplication_key is not null;
create index notification_events_appointment_idx
  on public.notification_events (appointment_id, created_at desc);
create index notification_tokens_user_enabled_idx
  on public.notification_tokens (user_id, enabled);

-- ---------------------------------------------------------------------------
-- Generic triggers and immutable exam-session manifest
-- ---------------------------------------------------------------------------

create function reflab_private.canonical_jsonb_text(p_value jsonb)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
declare
  value_type text;
  canonical_value text;
begin
  value_type := pg_catalog.jsonb_typeof(p_value);

  case value_type
    when 'object' then
      select
        '{'
        || coalesce(
          pg_catalog.string_agg(
            pg_catalog.to_jsonb(entry.key)::text
            || ':'
            || reflab_private.canonical_jsonb_text(entry.value),
            ','
            order by entry.key collate "C"
          ),
          ''
        )
        || '}'
      into canonical_value
      from pg_catalog.jsonb_each(p_value) as entry(key, value);
    when 'array' then
      select
        '['
        || coalesce(
          pg_catalog.string_agg(
            reflab_private.canonical_jsonb_text(entry.value),
            ','
            order by entry.ordinality
          ),
          ''
        )
        || ']'
      into canonical_value
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as entry(value, ordinality);
    when 'string' then
      canonical_value := pg_catalog.to_jsonb(p_value #>> '{}')::text;
    when 'number' then
      canonical_value := pg_catalog.trim_scale(
        (p_value #>> '{}')::numeric
      )::text;
    when 'boolean' then
      canonical_value := p_value::text;
    when 'null' then
      canonical_value := 'null';
    else
      raise exception 'unsupported JSON type: %', value_type;
  end case;

  return canonical_value;
end
$function$;

create function reflab_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$function$;

create function reflab_private.validate_referee_exam_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  manifest_item jsonb;
  occurrence_count integer;
  position_count integer;
  computed_manifest_hash text;
  allowed_manifest_keys constant text[] := array[
    'source_item_type',
    'source_item_id',
    'occurrence_id',
    'position',
    'source_version'
  ]::text[];
begin
  if pg_catalog.jsonb_typeof(new.item_manifest) <> 'array' then
    raise exception 'item_manifest must be a JSON array';
  end if;

  if pg_catalog.jsonb_array_length(new.item_manifest) <> new.item_count then
    raise exception 'item_count does not match item_manifest';
  end if;

  for manifest_item in
    select value
    from pg_catalog.jsonb_array_elements(new.item_manifest)
  loop
    if pg_catalog.jsonb_typeof(manifest_item) <> 'object' then
      raise exception 'each manifest item must be a JSON object';
    end if;

    if not (
      manifest_item ? 'source_item_type'
      and manifest_item ? 'source_item_id'
      and manifest_item ? 'occurrence_id'
      and manifest_item ? 'position'
    ) then
      raise exception 'manifest item is missing a required key';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(manifest_item)
        as supplied(supplied_key)
      where not (supplied_key = any (allowed_manifest_keys))
    ) then
      raise exception 'manifest item contains an unsupported key';
    end if;

    if pg_catalog.jsonb_typeof(manifest_item->'source_item_type') <> 'string'
       or pg_catalog.jsonb_typeof(manifest_item->'source_item_id') <> 'string'
       or pg_catalog.jsonb_typeof(manifest_item->'occurrence_id') <> 'string'
       or pg_catalog.jsonb_typeof(manifest_item->'position') <> 'number' then
      raise exception 'manifest item has an invalid required value type';
    end if;

    if manifest_item->>'source_item_type' not in (
      'global_clip',
      'institutional_clip',
      'rule_question',
      'manual'
    ) then
      raise exception 'manifest item has an invalid source_item_type';
    end if;

    if pg_catalog.btrim(manifest_item->>'source_item_id') = '' then
      raise exception 'manifest source_item_id cannot be empty';
    end if;

    perform (manifest_item->>'occurrence_id')::uuid;

    if (manifest_item->>'position')::numeric
       <> pg_catalog.trunc((manifest_item->>'position')::numeric) then
      raise exception 'manifest position must be an integer';
    end if;

    if (manifest_item->>'position')::integer < 1
       or (manifest_item->>'position')::integer > new.item_count then
      raise exception 'manifest position is outside the expected range';
    end if;

    if manifest_item ? 'source_version'
       and pg_catalog.jsonb_typeof(manifest_item->'source_version') not in ('string', 'null') then
      raise exception 'manifest source_version must be a string or null';
    end if;

    if manifest_item->>'source_item_type' = 'global_clip' then
      perform (manifest_item->>'source_item_id')::uuid;

      if not exists (
        select 1
        from public.clips clip
        where clip.id = (manifest_item->>'source_item_id')::uuid
          and clip.sport_type = new.sport_type
          and clip.is_active
          and clip.status = 'published'
      ) then
        raise exception 'manifest references an unavailable global clip';
      end if;
    elsif manifest_item->>'source_item_type' = 'institutional_clip' then
      perform (manifest_item->>'source_item_id')::uuid;

      if not exists (
        select 1
        from public.institutional_clips clip
        where clip.id = (manifest_item->>'source_item_id')::uuid
          and clip.sport_type = new.sport_type
          and clip.status = 'published'
          and (
            clip.is_public
            or (
              new.context_type = 'institutional'
              and clip.institution_id = new.institution_id
            )
          )
      ) then
        raise exception 'manifest references an unavailable institutional clip';
      end if;
    elsif manifest_item->>'source_item_type' = 'manual' then
      perform (manifest_item->>'source_item_id')::uuid;

      if manifest_item->>'source_item_id'
         <> manifest_item->>'occurrence_id' then
        raise exception 'manual source_item_id must equal occurrence_id';
      end if;
    end if;
  end loop;

  select count(distinct value->>'occurrence_id')
  into occurrence_count
  from pg_catalog.jsonb_array_elements(new.item_manifest);

  select count(distinct (value->>'position')::integer)
  into position_count
  from pg_catalog.jsonb_array_elements(new.item_manifest);

  if occurrence_count <> new.item_count or position_count <> new.item_count then
    raise exception 'manifest occurrences and positions must be unique';
  end if;

  computed_manifest_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        reflab_private.canonical_jsonb_text(new.item_manifest),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if computed_manifest_hash <> new.manifest_hash then
    raise exception 'manifest_hash does not match the normalized item_manifest';
  end if;

  return new;
end
$function$;

create function reflab_private.protect_referee_exam_session()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if old.user_id is distinct from new.user_id
     or old.submission_id is distinct from new.submission_id
     or old.context_type is distinct from new.context_type
     or old.sport_type is distinct from new.sport_type
     or old.activity_type is distinct from new.activity_type
     or old.season is distinct from new.season
     or old.source_version is distinct from new.source_version
     or old.institution_id is distinct from new.institution_id
     or old.institution_group_id is distinct from new.institution_group_id
     or old.institution_assessment_session_id is distinct from new.institution_assessment_session_id
     or old.item_manifest is distinct from new.item_manifest
     or old.manifest_hash is distinct from new.manifest_hash
     or old.item_count is distinct from new.item_count
     or old.created_at is distinct from new.created_at
     or old.started_at is distinct from new.started_at
     or old.expires_at is distinct from new.expires_at then
    raise exception 'immutable referee exam session fields cannot be changed';
  end if;

  if old.status in ('submitted', 'expired', 'cancelled')
     and new.status is distinct from old.status then
    raise exception 'terminal referee exam sessions cannot change status';
  end if;

  if old.status = 'created' and new.status not in ('created', 'active', 'expired', 'cancelled') then
    raise exception 'invalid referee exam session transition';
  end if;

  if old.status = 'active' and new.status not in ('active', 'submitted', 'expired', 'cancelled') then
    raise exception 'invalid referee exam session transition';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    raise exception 'submitted_at is required for a submitted exam session';
  end if;

  if new.status <> 'submitted' and new.submitted_at is not null then
    raise exception 'submitted_at is only valid for a submitted exam session';
  end if;

  return new;
end
$function$;

create trigger referee_exam_sessions_validate_manifest
before insert on public.referee_exam_sessions
for each row execute function reflab_private.validate_referee_exam_manifest();

create trigger referee_exam_sessions_protect_immutable
before update on public.referee_exam_sessions
for each row execute function reflab_private.protect_referee_exam_session();

-- ---------------------------------------------------------------------------
-- Canonical Clerk identity and institution authorization helpers
-- ---------------------------------------------------------------------------

create function reflab_private.request_user_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(
    pg_catalog.btrim(coalesce(auth.jwt()->>'sub', '')),
    ''
  );
$function$;

create function reflab_private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.user_global_roles global_role
    where global_role.user_id = reflab_private.request_user_id()
      and global_role.role_key = 'super_admin'
  );
$function$;

create function reflab_private.has_active_institution_membership(
  p_institution_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    reflab_private.is_super_admin()
    or exists (
      select 1
      from public.institution_memberships membership
      join public.institutions institution
        on institution.id = membership.institution_id
      join public.institution_subscriptions subscription
        on subscription.institution_id = institution.id
      where membership.institution_id = p_institution_id
        and membership.user_id = reflab_private.request_user_id()
        and membership.status = 'active'
        and institution.deleted_at is null
        and institution.status in ('trial', 'active')
        and subscription.status in ('trialing', 'active')
        and subscription.starts_at <= pg_catalog.now()
        and (
          subscription.ends_at is null
          or subscription.ends_at > pg_catalog.now()
        )
    );
$function$;

create function reflab_private.has_institution_permission(
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with caller_membership as (
    select membership.id
    from public.institution_memberships membership
    where membership.institution_id = p_institution_id
      and membership.user_id = reflab_private.request_user_id()
      and membership.status = 'active'
  ),
  requested_permission as (
    select permission.id
    from public.institution_permissions permission
    where permission.permission_key = p_permission_key
  ),
  explicit_override as (
    select override.allowed
    from public.institution_membership_permission_overrides override
    join caller_membership
      on caller_membership.id = override.membership_id
    join requested_permission
      on requested_permission.id = override.permission_id
    where override.institution_id = p_institution_id
    limit 1
  ),
  role_permission as (
    select true as allowed
    from caller_membership
    join public.institution_membership_roles membership_role
      on membership_role.membership_id = caller_membership.id
     and membership_role.institution_id = p_institution_id
    join public.institution_roles institution_role
      on institution_role.id = membership_role.role_id
     and (
       institution_role.institution_id = p_institution_id
       or institution_role.institution_id is null
     )
    join public.institution_role_permissions role_permission
      on role_permission.role_id = institution_role.id
    join requested_permission
      on requested_permission.id = role_permission.permission_id
    limit 1
  )
  select
    reflab_private.is_super_admin()
    or (
      reflab_private.has_active_institution_membership(p_institution_id)
      and case
        when exists (select 1 from explicit_override where allowed = false) then false
        when exists (select 1 from explicit_override where allowed = true) then true
        else exists (select 1 from role_permission)
      end
    );
$function$;

create function reflab_private.can_access_user_data(
  p_target_user_id text,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    p_target_user_id = reflab_private.request_user_id()
    or reflab_private.is_super_admin()
    or (
      p_institution_id is not null
      and reflab_private.has_institution_permission(
        p_institution_id,
        p_permission_key
      )
      and exists (
        select 1
        from public.institution_memberships target_membership
        where target_membership.institution_id = p_institution_id
          and target_membership.user_id = p_target_user_id
          and target_membership.status = 'active'
      )
    );
$function$;

-- ---------------------------------------------------------------------------
-- Atomic and idempotent referee exam submission
-- ---------------------------------------------------------------------------

create function public.submit_referee_exam(
  p_user_id text,
  p_exam_session_id uuid,
  p_submission_id uuid,
  p_payload_hash text,
  p_evaluated_attempts jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  exam_session public.referee_exam_sessions%rowtype;
  existing_result public.exam_results%rowtype;
  evaluated_attempt jsonb;
  result_id uuid;
  attempt_count integer;
  inserted_attempt_count integer;
  distinct_occurrence_count integer;
  mismatch_count integer;
  payload_size integer;
  total_score numeric(10,2);
  total_max_score numeric(10,2);
  average_score numeric(5,2);
  correct_count integer;
  computed_payload_hash text;
  user_ref_card_id text;
  allowed_keys constant text[] := array[
    'occurrence_id',
    'source_item_type',
    'source_item_id',
    'clip_title',
    'topic',
    'subtopic',
    'rule_reference',
    'difficulty',
    'selected_decision',
    'correct_decision',
    'selected_restart',
    'correct_restart',
    'selected_discipline',
    'correct_discipline',
    'score',
    'max_score',
    'is_correct',
    'technical_correct',
    'restart_correct',
    'disciplinary_correct',
    'subtype_correct',
    'accumulated_foul_correct',
    'four_second_correct',
    'goalkeeper_correct',
    'justification_correct',
    'var_correct',
    'app_correct',
    'ofr_correct',
    'var_intervention_correct',
    'factual_vs_interpretative_correct',
    'final_decision_correct',
    'criterion_result',
    'feedback',
    'time_spent_seconds'
  ]::text[];
  boolean_keys constant text[] := array[
    'technical_correct',
    'restart_correct',
    'disciplinary_correct',
    'subtype_correct',
    'accumulated_foul_correct',
    'four_second_correct',
    'goalkeeper_correct',
    'justification_correct',
    'var_correct',
    'app_correct',
    'ofr_correct',
    'var_intervention_correct',
    'factual_vs_interpretative_correct',
    'final_decision_correct'
  ]::text[];
  text_keys constant text[] := array[
    'clip_title',
    'topic',
    'subtopic',
    'rule_reference',
    'difficulty',
    'selected_decision',
    'correct_decision',
    'selected_restart',
    'correct_restart',
    'selected_discipline',
    'correct_discipline',
    'feedback'
  ]::text[];
  current_key text;
begin
  if p_user_id is null or pg_catalog.btrim(p_user_id) = '' then
    raise exception 'user identity is required';
  end if;

  if p_exam_session_id is null or p_submission_id is null then
    raise exception 'exam_session_id and submission_id are required';
  end if;

  if p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'payload_hash must be a lowercase SHA-256 digest';
  end if;

  if p_evaluated_attempts is null
     or pg_catalog.jsonb_typeof(p_evaluated_attempts) <> 'array' then
    raise exception 'evaluated_attempts must be a JSON array';
  end if;

  computed_payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        reflab_private.canonical_jsonb_text(p_evaluated_attempts),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if computed_payload_hash <> p_payload_hash then
    raise exception 'payload_hash does not match the normalized evaluated_attempts';
  end if;

  payload_size := pg_catalog.octet_length(
    pg_catalog.convert_to(p_evaluated_attempts::text, 'UTF8')
  );

  if payload_size > 262144 then
    raise exception 'evaluated_attempts exceeds the 256 KiB limit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id || ':' || p_submission_id::text,
      0
    )
  );

  select *
  into exam_session
  from public.referee_exam_sessions session_row
  where session_row.id = p_exam_session_id
  for update;

  if not found then
    raise exception 'referee exam session not found';
  end if;

  if exam_session.user_id <> p_user_id then
    raise exception 'referee exam session does not belong to the authenticated user';
  end if;

  if exam_session.submission_id <> p_submission_id then
    raise exception 'submission_id does not match the referee exam session';
  end if;

  select *
  into existing_result
  from public.exam_results result_row
  where result_row.user_id = p_user_id
    and result_row.submission_id = p_submission_id;

  if found then
    if existing_result.exam_session_id <> p_exam_session_id
       or existing_result.payload_hash <> p_payload_hash then
      raise exception 'submission_id was already used with different content';
    end if;

    return pg_catalog.jsonb_build_object(
      'exam_result_id', existing_result.id,
      'exam_session_id', existing_result.exam_session_id,
      'submission_id', existing_result.submission_id,
      'avg_score', existing_result.avg_score,
      'correct_count', existing_result.correct_count,
      'total_questions', existing_result.total_questions,
      'idempotent_replay', true
    );
  end if;

  if exam_session.status not in ('created', 'active') then
    raise exception 'referee exam session is not open for submission';
  end if;

  if exam_session.expires_at <= pg_catalog.now() then
    raise exception 'referee exam session has expired';
  end if;

  if exam_session.context_type = 'institutional' then
    if not exists (
      select 1
      from public.institution_assessment_sessions assessment_session
      join public.institution_assessment_assignments assignment
        on assignment.id = assessment_session.assignment_id
       and assignment.assessment_id = assessment_session.assessment_id
       and assignment.institution_id = assessment_session.institution_id
      join public.institution_assessments assessment
        on assessment.id = assessment_session.assessment_id
       and assessment.institution_id = assessment_session.institution_id
      join public.institution_memberships membership
        on membership.institution_id = assessment_session.institution_id
       and membership.user_id = assessment_session.user_id
       and membership.status = 'active'
      where assessment_session.id = exam_session.institution_assessment_session_id
        and assessment_session.institution_id = exam_session.institution_id
        and assessment_session.user_id = p_user_id
        and assessment_session.status in ('not_started', 'in_progress')
        and assessment.sport_type = exam_session.sport_type
        and (
          assignment.user_id = p_user_id
          or (
            assignment.user_id is null
            and assignment.group_id = exam_session.institution_group_id
            and exists (
              select 1
              from public.institution_group_memberships group_membership
              where group_membership.group_id = assignment.group_id
                and group_membership.membership_id = membership.id
                and group_membership.status = 'active'
            )
          )
        )
        and (
          assessment_session.group_id is not distinct from
          exam_session.institution_group_id
        )
    ) then
      raise exception 'institutional exam context is invalid or no longer assigned';
    end if;
  elsif exam_session.institution_id is not null
     or exam_session.institution_group_id is not null
     or exam_session.institution_assessment_session_id is not null then
    raise exception 'individual exam session contains institutional context';
  end if;

  attempt_count := pg_catalog.jsonb_array_length(p_evaluated_attempts);

  if attempt_count <> exam_session.item_count
     or attempt_count < 1
     or attempt_count > 100 then
    raise exception 'evaluated attempt count does not match the manifest';
  end if;

  for evaluated_attempt in
    select value
    from pg_catalog.jsonb_array_elements(p_evaluated_attempts)
  loop
    if pg_catalog.jsonb_typeof(evaluated_attempt) <> 'object' then
      raise exception 'each evaluated attempt must be a JSON object';
    end if;

    if not (
      evaluated_attempt ?& array[
        'occurrence_id',
        'source_item_type',
        'source_item_id',
        'score',
        'max_score',
        'is_correct'
      ]::text[]
    ) then
      raise exception 'evaluated attempt is missing a required key';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(evaluated_attempt)
        as supplied(supplied_key)
      where not (supplied_key = any (allowed_keys))
    ) then
      raise exception 'evaluated attempt contains an unsupported key';
    end if;

    if pg_catalog.jsonb_typeof(evaluated_attempt->'occurrence_id') <> 'string'
       or pg_catalog.jsonb_typeof(evaluated_attempt->'source_item_type') <> 'string'
       or pg_catalog.jsonb_typeof(evaluated_attempt->'source_item_id') <> 'string'
       or pg_catalog.jsonb_typeof(evaluated_attempt->'score') <> 'number'
       or pg_catalog.jsonb_typeof(evaluated_attempt->'max_score') <> 'number'
       or pg_catalog.jsonb_typeof(evaluated_attempt->'is_correct') <> 'boolean' then
      raise exception 'evaluated attempt has an invalid required value type';
    end if;

    perform (evaluated_attempt->>'occurrence_id')::uuid;

    if evaluated_attempt->>'source_item_type' not in (
      'global_clip',
      'institutional_clip',
      'rule_question',
      'manual'
    ) then
      raise exception 'evaluated attempt has an invalid source_item_type';
    end if;

    if pg_catalog.btrim(evaluated_attempt->>'source_item_id') = '' then
      raise exception 'evaluated attempt source_item_id cannot be empty';
    end if;

    if (evaluated_attempt->>'max_score')::numeric <= 0
       or (evaluated_attempt->>'max_score')::numeric > 100
       or (evaluated_attempt->>'score')::numeric < 0
       or (evaluated_attempt->>'score')::numeric >
          (evaluated_attempt->>'max_score')::numeric then
      raise exception 'evaluated attempt score is outside the allowed range';
    end if;

    foreach current_key in array boolean_keys
    loop
      if evaluated_attempt ? current_key
         and pg_catalog.jsonb_typeof(evaluated_attempt->current_key) not in ('boolean', 'null') then
        raise exception 'evaluated attempt boolean field has an invalid type';
      end if;
    end loop;

    foreach current_key in array text_keys
    loop
      if evaluated_attempt ? current_key
         and pg_catalog.jsonb_typeof(evaluated_attempt->current_key) not in ('string', 'null') then
        raise exception 'evaluated attempt text field has an invalid type';
      end if;
    end loop;

    if evaluated_attempt ? 'time_spent_seconds' then
      if pg_catalog.jsonb_typeof(evaluated_attempt->'time_spent_seconds') not in ('number', 'null') then
        raise exception 'time_spent_seconds has an invalid type';
      end if;

      if pg_catalog.jsonb_typeof(evaluated_attempt->'time_spent_seconds') = 'number'
         and (
           (evaluated_attempt->>'time_spent_seconds')::numeric < 0
           or (evaluated_attempt->>'time_spent_seconds')::numeric
              <> pg_catalog.trunc((evaluated_attempt->>'time_spent_seconds')::numeric)
         ) then
        raise exception 'time_spent_seconds must be a non-negative integer';
      end if;
    end if;

    if evaluated_attempt ? 'criterion_result'
       and pg_catalog.jsonb_typeof(evaluated_attempt->'criterion_result') not in ('object', 'null') then
      raise exception 'criterion_result must be a JSON object or null';
    end if;
  end loop;

  select count(distinct value->>'occurrence_id')
  into distinct_occurrence_count
  from pg_catalog.jsonb_array_elements(p_evaluated_attempts);

  if distinct_occurrence_count <> attempt_count then
    raise exception 'evaluated attempts contain duplicate occurrence_id values';
  end if;

  select count(*)
  into mismatch_count
  from (
    (
      select
        value->>'occurrence_id' as occurrence_id,
        value->>'source_item_type' as source_item_type,
        value->>'source_item_id' as source_item_id
      from pg_catalog.jsonb_array_elements(p_evaluated_attempts)
      except
      select
        value->>'occurrence_id',
        value->>'source_item_type',
        value->>'source_item_id'
      from pg_catalog.jsonb_array_elements(exam_session.item_manifest)
    )
    union all
    (
      select
        value->>'occurrence_id',
        value->>'source_item_type',
        value->>'source_item_id'
      from pg_catalog.jsonb_array_elements(exam_session.item_manifest)
      except
      select
        value->>'occurrence_id',
        value->>'source_item_type',
        value->>'source_item_id'
      from pg_catalog.jsonb_array_elements(p_evaluated_attempts)
    )
  ) manifest_difference;

  if mismatch_count > 0 then
    raise exception 'evaluated attempts do not match the immutable item manifest';
  end if;

  select
    coalesce(pg_catalog.sum((value->>'score')::numeric), 0),
    coalesce(pg_catalog.sum((value->>'max_score')::numeric), 0),
    pg_catalog.count(*) filter (
      where (value->>'is_correct')::boolean
    )
  into total_score, total_max_score, correct_count
  from pg_catalog.jsonb_array_elements(p_evaluated_attempts);

  if total_max_score <= 0 then
    raise exception 'total maximum score must be greater than zero';
  end if;

  average_score := pg_catalog.round((total_score / total_max_score) * 100, 2);

  select profile.ref_card_id
  into user_ref_card_id
  from public.user_profiles profile
  where profile.user_id = p_user_id;

  insert into public.exam_results (
    user_id,
    exam_session_id,
    submission_id,
    payload_hash,
    sport_type,
    activity_type,
    season,
    source_version,
    ref_card_id,
    institution_id,
    institution_group_id,
    institution_assessment_session_id,
    total_questions,
    total_score,
    avg_score,
    correct_count,
    details,
    submitted_at
  )
  values (
    p_user_id,
    exam_session.id,
    p_submission_id,
    p_payload_hash,
    exam_session.sport_type,
    exam_session.activity_type,
    exam_session.season,
    exam_session.source_version,
    user_ref_card_id,
    exam_session.institution_id,
    exam_session.institution_group_id,
    exam_session.institution_assessment_session_id,
    attempt_count,
    total_score,
    average_score,
    correct_count,
    p_evaluated_attempts,
    pg_catalog.now()
  )
  returning id into result_id;

  insert into public.attempts (
    user_id,
    sport_type,
    activity_type,
    exam_result_id,
    submission_id,
    clip_id,
    clip_title,
    source_item_type,
    source_item_id,
    source_occurrence_id,
    module,
    mode,
    topic,
    subtopic,
    rule_reference,
    season,
    source_version,
    difficulty,
    score,
    is_correct,
    selected_decision,
    correct_decision,
    selected_restart,
    correct_restart,
    selected_discipline,
    correct_discipline,
    technical_correct,
    restart_correct,
    discipline_correct,
    disciplinary_correct,
    subtype_correct,
    accumulated_foul_correct,
    four_second_correct,
    goalkeeper_correct,
    justification_correct,
    var_correct,
    app_correct,
    ofr_correct,
    var_intervention_correct,
    factual_vs_interpretative_correct,
    final_decision_correct,
    criterion_result,
    feedback,
    time_spent_seconds,
    institution_id,
    institution_group_id,
    institution_assessment_session_id,
    created_at
  )
  select
    p_user_id,
    exam_session.sport_type,
    exam_session.activity_type,
    result_id,
    p_submission_id,
    case
      when item->>'source_item_type' = 'global_clip'
        then item->>'source_item_id'
      else null
    end,
    nullif(item->>'clip_title', ''),
    item->>'source_item_type',
    item->>'source_item_id',
    (item->>'occurrence_id')::uuid,
    case
      when exam_session.sport_type = 'futsal' then 'futsal_video_analysis'
      else 'decision'
    end,
    'exam',
    nullif(item->>'topic', ''),
    nullif(item->>'subtopic', ''),
    nullif(item->>'rule_reference', ''),
    exam_session.season,
    exam_session.source_version,
    nullif(item->>'difficulty', ''),
    pg_catalog.round(
      ((item->>'score')::numeric / (item->>'max_score')::numeric) * 100,
      2
    ),
    (item->>'is_correct')::boolean,
    nullif(item->>'selected_decision', ''),
    nullif(item->>'correct_decision', ''),
    nullif(item->>'selected_restart', ''),
    nullif(item->>'correct_restart', ''),
    nullif(item->>'selected_discipline', ''),
    nullif(item->>'correct_discipline', ''),
    case
      when pg_catalog.jsonb_typeof(item->'technical_correct') = 'boolean'
        then (item->>'technical_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'restart_correct') = 'boolean'
        then (item->>'restart_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'disciplinary_correct') = 'boolean'
        then (item->>'disciplinary_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'disciplinary_correct') = 'boolean'
        then (item->>'disciplinary_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'subtype_correct') = 'boolean'
        then (item->>'subtype_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'accumulated_foul_correct') = 'boolean'
        then (item->>'accumulated_foul_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'four_second_correct') = 'boolean'
        then (item->>'four_second_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'goalkeeper_correct') = 'boolean'
        then (item->>'goalkeeper_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'justification_correct') = 'boolean'
        then (item->>'justification_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'var_correct') = 'boolean'
        then (item->>'var_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'app_correct') = 'boolean'
        then (item->>'app_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'ofr_correct') = 'boolean'
        then (item->>'ofr_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'var_intervention_correct') = 'boolean'
        then (item->>'var_intervention_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'factual_vs_interpretative_correct') = 'boolean'
        then (item->>'factual_vs_interpretative_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'final_decision_correct') = 'boolean'
        then (item->>'final_decision_correct')::boolean
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(item->'criterion_result') = 'object'
        then item->'criterion_result'
      else null
    end,
    nullif(item->>'feedback', ''),
    case
      when pg_catalog.jsonb_typeof(item->'time_spent_seconds') = 'number'
        then (item->>'time_spent_seconds')::integer
      else null
    end,
    exam_session.institution_id,
    exam_session.institution_group_id,
    exam_session.institution_assessment_session_id,
    pg_catalog.now()
  from pg_catalog.jsonb_array_elements(p_evaluated_attempts)
    as evaluated(item);

  get diagnostics inserted_attempt_count = row_count;

  if inserted_attempt_count <> exam_session.item_count then
    raise exception 'attempt insertion count does not match the exam manifest';
  end if;

  update public.referee_exam_sessions
  set
    status = 'submitted',
    submitted_at = pg_catalog.now()
  where id = exam_session.id;

  if exam_session.institution_assessment_session_id is not null then
    update public.institution_assessment_sessions
    set
      status = 'submitted',
      submitted_at = pg_catalog.now(),
      score = total_score,
      percentage = average_score,
      passed = case
        when (
          select minimum_score
          from public.institution_assessments assessment
          where assessment.id = public.institution_assessment_sessions.assessment_id
        ) is null then null
        else average_score >= (
          select minimum_score
          from public.institution_assessments assessment
          where assessment.id = public.institution_assessment_sessions.assessment_id
        )
      end,
      result_payload = pg_catalog.jsonb_build_object(
        'exam_result_id', result_id,
        'submission_id', p_submission_id,
        'payload_hash', p_payload_hash
      ),
      updated_at = pg_catalog.now()
    where id = exam_session.institution_assessment_session_id
      and user_id = p_user_id;

    if not found then
      raise exception 'institutional assessment session could not be finalized';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'exam_result_id', result_id,
    'exam_session_id', exam_session.id,
    'submission_id', p_submission_id,
    'avg_score', average_score,
    'correct_count', correct_count,
    'total_questions', attempt_count,
    'idempotent_replay', false
  );
end
$function$;

-- ---------------------------------------------------------------------------
-- Trigger registration
-- ---------------------------------------------------------------------------

do $updated_at_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'platform_roles',
    'access_plans',
    'capabilities',
    'countries',
    'associations',
    'competitions',
    'competition_seasons',
    'competition_categories',
    'teams',
    'venues',
    'institutions',
    'user_profiles',
    'user_global_roles',
    'user_subscriptions',
    'institution_subscriptions',
    'capability_overrides',
    'user_roles',
    'institution_permissions',
    'institution_roles',
    'institution_memberships',
    'institution_membership_permission_overrides',
    'institution_members',
    'institution_cohorts',
    'institution_groups',
    'institution_group_memberships',
    'institution_contents',
    'institution_assessments',
    'institution_assessment_sessions',
    'institution_notification_campaigns',
    'institution_notification_recipients',
    'institution_data_consents',
    'referee_roles',
    'fixtures',
    'fixture_sync_logs',
    'referee_eligibility',
    'appointments',
    'match_officials',
    'match_context_snapshots',
    'match_preparations',
    'post_match_reviews',
    'clips',
    'institutional_clips',
    'ifab_library_documents',
    'psychology_modules',
    'performance_checkins',
    'performance_sessions',
    'wellness_logs',
    'physical_tests',
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions',
    'coach_rate_limit_buckets',
    'coach_data_consents',
    'institutional_leads',
    'notification_preferences',
    'notification_tokens',
    'notification_events'
  ]::text[]
  loop
    execute pg_catalog.format(
      'create trigger %I before update on public.%I for each row execute function reflab_private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end
$updated_at_triggers$;

-- ---------------------------------------------------------------------------
-- Canonical catalog rows
-- ---------------------------------------------------------------------------

insert into public.platform_roles (role_key, label, description)
values
  ('super_admin', 'Super Admin', 'Global RefLab administration.'),
  ('institution_admin', 'Institution Admin', 'Institution-level administration.'),
  ('instructor', 'Instructor', 'Institution instructor and evaluator.'),
  ('referee', 'Referee', 'Individual referee account.');

insert into public.access_plans (plan_key, label, audience, description)
values
  ('basic', 'Basic', 'individual', 'Entry individual access.'),
  ('pro', 'Pro', 'individual', 'Complete individual development access.'),
  ('academy', 'Academy', 'institution', 'Schools and referee academies.'),
  ('enterprise', 'Enterprise', 'institution', 'Leagues, associations and federations.');

insert into public.capabilities (capability_key, label, category)
values
  ('basic_profile', 'Basic profile', 'profile'),
  ('basic_library', 'Official library', 'library'),
  ('selected_training', 'Selected training', 'training'),
  ('limited_evaluations', 'Limited evaluations', 'evaluation'),
  ('advanced_dashboard', 'Advanced technical dashboard', 'performance'),
  ('full_evaluations', 'Complete evaluations', 'evaluation'),
  ('ref_performance', 'Ref Performance', 'performance'),
  ('ai_coach', 'RefLab Coach', 'ai'),
  ('institution_management', 'Institution management', 'institution'),
  ('group_management', 'Group management', 'institution'),
  ('content_assignment', 'Content assignment', 'institution'),
  ('institution_reports', 'Institution reports', 'reporting'),
  ('advanced_institution_analytics', 'Advanced institution analytics', 'reporting'),
  ('multi_site_management', 'Multi-site management', 'institution'),
  ('platform_audit', 'Platform audit', 'security');

insert into public.plan_capabilities (plan_key, capability_key)
values
  ('basic', 'basic_profile'),
  ('basic', 'basic_library'),
  ('basic', 'selected_training'),
  ('basic', 'limited_evaluations'),
  ('pro', 'basic_profile'),
  ('pro', 'basic_library'),
  ('pro', 'selected_training'),
  ('pro', 'limited_evaluations'),
  ('pro', 'advanced_dashboard'),
  ('pro', 'full_evaluations'),
  ('pro', 'ref_performance'),
  ('pro', 'ai_coach'),
  ('academy', 'basic_profile'),
  ('academy', 'basic_library'),
  ('academy', 'advanced_dashboard'),
  ('academy', 'full_evaluations'),
  ('academy', 'ref_performance'),
  ('academy', 'institution_management'),
  ('academy', 'group_management'),
  ('academy', 'content_assignment'),
  ('academy', 'institution_reports'),
  ('enterprise', 'basic_profile'),
  ('enterprise', 'basic_library'),
  ('enterprise', 'advanced_dashboard'),
  ('enterprise', 'full_evaluations'),
  ('enterprise', 'ref_performance'),
  ('enterprise', 'ai_coach'),
  ('enterprise', 'institution_management'),
  ('enterprise', 'group_management'),
  ('enterprise', 'content_assignment'),
  ('enterprise', 'institution_reports'),
  ('enterprise', 'advanced_institution_analytics'),
  ('enterprise', 'multi_site_management'),
  ('enterprise', 'platform_audit');

insert into public.institution_permissions (
  permission_key,
  name,
  permission_scope,
  is_sensitive
)
values
  ('institution.read', 'Read institution', 'institution', false),
  ('institution.manage', 'Manage institution', 'institution', true),
  ('members.read', 'Read members', 'members', false),
  ('members.manage', 'Manage members', 'members', true),
  ('members.invite', 'Invite members', 'members', true),
  ('roles.read', 'Read roles', 'roles', false),
  ('roles.manage', 'Manage roles', 'roles', true),
  ('groups.read', 'Read groups', 'groups', false),
  ('groups.manage', 'Manage groups', 'groups', true),
  ('content.read', 'Read content', 'content', false),
  ('content.manage', 'Manage content', 'content', true),
  ('content.publish', 'Publish content', 'content', true),
  ('assessments.read', 'Read assessments', 'assessments', false),
  ('assessments.take', 'Take assessments', 'assessments', false),
  ('assessments.manage', 'Manage assessments', 'assessments', true),
  ('assessments.grade', 'Grade assessments', 'assessments', true),
  ('metrics.read_own', 'Read own metrics', 'metrics', false),
  ('metrics.read_individual', 'Read individual metrics', 'metrics', true),
  ('metrics.read_aggregate', 'Read aggregate metrics', 'metrics', true),
  ('reports.read', 'Read reports', 'reports', true),
  ('reports.export', 'Export reports', 'reports', true),
  ('notifications.read', 'Read notifications', 'notifications', false),
  ('notifications.send', 'Send notifications', 'notifications', true),
  ('audit.read', 'Read institution audit', 'security', true);

insert into public.institution_roles (
  institution_id,
  role_key,
  name,
  description,
  is_system,
  is_assignable
)
values
  (null, 'institution_admin', 'Institution Admin', 'Full institution administration.', true, true),
  (null, 'instructor', 'Instructor', 'Instruction, assessment and group access.', true, true),
  (null, 'referee', 'Referee', 'Individual participant access.', true, true);

insert into public.institution_role_permissions (
  institution_id,
  role_id,
  permission_id
)
select
  null,
  role.id,
  permission.id
from public.institution_roles role
cross join public.institution_permissions permission
where role.institution_id is null
  and (
    role.role_key = 'institution_admin'
    or (
      role.role_key = 'instructor'
      and permission.permission_key in (
        'institution.read',
        'members.read',
        'roles.read',
        'groups.read',
        'content.read',
        'assessments.read',
        'assessments.grade',
        'metrics.read_individual',
        'metrics.read_aggregate',
        'reports.read',
        'notifications.read'
      )
    )
    or (
      role.role_key = 'referee'
      and permission.permission_key in (
        'institution.read',
        'content.read',
        'assessments.read',
        'assessments.take',
        'metrics.read_own',
        'notifications.read'
      )
    )
  );

insert into public.referee_roles (
  sport_type,
  role_key,
  label,
  role_group,
  requires_var,
  is_reserve,
  display_order
)
values
  ('football_11', 'referee', 'Referee', 'field', false, false, 10),
  ('football_11', 'assistant_1', 'Assistant Referee 1', 'assistant', false, false, 20),
  ('football_11', 'assistant_2', 'Assistant Referee 2', 'assistant', false, false, 30),
  ('football_11', 'fourth_official', 'Fourth Official', 'support', false, false, 40),
  ('football_11', 'fifth_official', 'Fifth Official', 'support', false, false, 50),
  ('football_11', 'var', 'VAR', 'video', true, false, 60),
  ('football_11', 'avar', 'AVAR', 'video', true, false, 70),
  ('football_11', 'reserve_assistant', 'Reserve Assistant', 'support', false, true, 80),
  ('football_11', 'other', 'Other', 'other', false, false, 90),
  ('futsal', 'first_referee', 'First Referee', 'field', false, false, 10),
  ('futsal', 'second_referee', 'Second Referee', 'field', false, false, 20),
  ('futsal', 'third_referee', 'Third Referee', 'support', false, false, 30),
  ('futsal', 'timekeeper', 'Timekeeper', 'support', false, false, 40),
  ('futsal', 'reserve_assistant', 'Reserve Assistant Referee', 'support', false, true, 50),
  ('futsal', 'other', 'Other', 'other', false, false, 60);

insert into public.psychology_modules (
  slug,
  name,
  description,
  is_active,
  sort_order
)
values
  ('gestion-error', 'Gestion del error', 'Recovery and learning after an error.', true, 10),
  ('presion-competitiva', 'Presion competitiva', 'Decision-making under competitive pressure.', true, 20),
  ('concentracion-foco', 'Concentracion y foco', 'Attention reset and concentration routines.', true, 30),
  ('confianza-arbitral', 'Confianza arbitral', 'Constructive self-talk and confidence.', true, 40),
  ('resiliencia', 'Resiliencia', 'Wellbeing, recovery and sustained motivation.', true, 50),
  ('preparacion-mental-pre-partido', 'Preparacion mental pre partido', 'Pre-match mental preparation.', true, 60),
  ('evaluacion-post-partido', 'Evaluacion post partido', 'Post-match reflection and emotional closure.', true, 70),
  ('sin-clasificar', 'Sin clasificar', 'Explicit temporary category for reviewed legacy content.', false, 999);

-- ---------------------------------------------------------------------------
-- RLS helper ownership and least-privilege table access
-- ---------------------------------------------------------------------------

grant usage on schema public, auth, reflab_private to reflab_rls_owner;
-- PostgreSQL requires the new function owner to hold CREATE on the function
-- schema during ownership transfer. This privilege is revoked immediately
-- after the four approved ALTER FUNCTION statements.
grant create on schema reflab_private to reflab_rls_owner;
grant execute on function auth.jwt() to reflab_rls_owner;
grant execute on function reflab_private.request_user_id()
  to reflab_rls_owner;

grant usage on schema reflab_private, extensions to service_role;
grant execute on function reflab_private.canonical_jsonb_text(jsonb)
  to service_role;

grant select on table
  public.user_global_roles,
  public.institutions,
  public.institution_subscriptions,
  public.institution_memberships,
  public.institution_membership_roles,
  public.institution_roles,
  public.institution_role_permissions,
  public.institution_permissions,
  public.institution_membership_permission_overrides
to reflab_rls_owner;

alter function reflab_private.is_super_admin() owner to reflab_rls_owner;
alter function reflab_private.has_active_institution_membership(uuid)
  owner to reflab_rls_owner;
alter function reflab_private.has_institution_permission(uuid, text)
  owner to reflab_rls_owner;
alter function reflab_private.can_access_user_data(text, uuid, text)
  owner to reflab_rls_owner;

revoke create on schema reflab_private from reflab_rls_owner;

revoke all on function reflab_private.request_user_id()
  from public, anon, authenticated;
revoke all on function reflab_private.is_super_admin()
  from public, anon, authenticated;
revoke all on function reflab_private.has_active_institution_membership(uuid)
  from public, anon, authenticated;
revoke all on function reflab_private.has_institution_permission(uuid, text)
  from public, anon, authenticated;
revoke all on function reflab_private.can_access_user_data(text, uuid, text)
  from public, anon, authenticated;

grant usage on schema reflab_private to authenticated;
grant execute on function reflab_private.request_user_id() to authenticated;
grant execute on function reflab_private.is_super_admin() to authenticated;
grant execute on function reflab_private.has_active_institution_membership(uuid)
  to authenticated;
grant execute on function reflab_private.has_institution_permission(uuid, text)
  to authenticated;
grant execute on function reflab_private.can_access_user_data(text, uuid, text)
  to authenticated;

revoke all on function public.submit_referee_exam(text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_referee_exam(text, uuid, uuid, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security and table grants
-- ---------------------------------------------------------------------------

do $secure_product_tables$
declare
  table_name text;
begin
  for table_name in
    select relation.relname
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relname <> 'spatial_ref_sys'
  loop
    execute pg_catalog.format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute pg_catalog.format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_name
    );
    execute pg_catalog.format(
      'grant select, insert, update, delete on table public.%I to service_role',
      table_name
    );
  end loop;
end
$secure_product_tables$;

-- Audit records are append-only for application roles, including service_role.
revoke update, delete on table
  public.access_change_audit,
  public.platform_audit_logs,
  public.institution_audit_logs,
  public.institution_assessment_history,
  public.institutional_lead_activities,
  public.exam_results,
  public.attempts,
  public.rules_exam_results
from service_role;

revoke delete on table public.referee_exam_sessions from service_role;

-- Compatibility tables are read-only snapshots in new installations.
revoke insert, update, delete on table
  public.user_roles,
  public.institution_members
from service_role;

-- The dedicated helper owner can only pass RLS on its explicitly granted
-- authorization tables.
create policy user_global_roles_rls_owner_read
on public.user_global_roles
for select
to reflab_rls_owner
using (true);

create policy institutions_rls_owner_read
on public.institutions
for select
to reflab_rls_owner
using (true);

create policy institution_subscriptions_rls_owner_read
on public.institution_subscriptions
for select
to reflab_rls_owner
using (true);

create policy institution_memberships_rls_owner_read
on public.institution_memberships
for select
to reflab_rls_owner
using (true);

create policy institution_membership_roles_rls_owner_read
on public.institution_membership_roles
for select
to reflab_rls_owner
using (true);

create policy institution_roles_rls_owner_read
on public.institution_roles
for select
to reflab_rls_owner
using (true);

create policy institution_role_permissions_rls_owner_read
on public.institution_role_permissions
for select
to reflab_rls_owner
using (true);

create policy institution_permissions_rls_owner_read
on public.institution_permissions
for select
to reflab_rls_owner
using (true);

create policy institution_permission_overrides_rls_owner_read
on public.institution_membership_permission_overrides
for select
to reflab_rls_owner
using (true);

-- Authenticated catalog access.
do $catalog_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'platform_roles',
    'access_plans',
    'capabilities',
    'plan_capabilities',
    'countries',
    'associations',
    'competitions',
    'competition_seasons',
    'competition_categories',
    'teams',
    'venues',
    'referee_roles',
    'fixtures',
    'match_context_snapshots',
    'psychology_modules'
  ]::text[]
  loop
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (true)',
      table_name || '_authenticated_read',
      table_name
    );
    execute pg_catalog.format(
      'grant select on table public.%I to authenticated',
      table_name
    );
  end loop;
end
$catalog_policies$;

create policy clips_authenticated_read
on public.clips
for select
to authenticated
using (is_active = true and status = 'published');

create policy library_authenticated_read
on public.ifab_library_documents
for select
to authenticated
using (true);

grant select on table
  public.clips,
  public.ifab_library_documents
to authenticated;

-- Canonical role, plan and override reads.
create policy user_global_roles_own_read
on public.user_global_roles
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.is_super_admin()
);

create policy user_subscriptions_own_read
on public.user_subscriptions
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.is_super_admin()
);

create policy capability_overrides_own_read
on public.capability_overrides
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.is_super_admin()
);

create policy access_change_audit_super_admin_read
on public.access_change_audit
for select
to authenticated
using (reflab_private.is_super_admin());

create policy platform_audit_super_admin_read
on public.platform_audit_logs
for select
to authenticated
using (reflab_private.is_super_admin());

create policy user_roles_legacy_own_read
on public.user_roles
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.is_super_admin()
);

grant select on table
  public.user_global_roles,
  public.user_subscriptions,
  public.capability_overrides,
  public.access_change_audit,
  public.platform_audit_logs,
  public.user_roles
to authenticated;

-- User profile is the canonical Clerk profile and may only be created or
-- updated by its owner. Administrative changes use server-only APIs.
create policy user_profiles_own_read
on public.user_profiles
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.is_super_admin()
);

create policy user_profiles_own_insert
on public.user_profiles
for insert
to authenticated
with check (user_id = reflab_private.request_user_id());

create policy user_profiles_own_update
on public.user_profiles
for update
to authenticated
using (user_id = reflab_private.request_user_id())
with check (user_id = reflab_private.request_user_id());

grant select on table public.user_profiles to authenticated;

grant insert (
  user_id,
  email,
  reflab_name,
  first_name,
  last_name,
  country,
  city,
  association,
  association_id,
  referee_type,
  main_role,
  referee_role,
  category,
  level,
  birth_date,
  ranking_display_name,
  show_real_name_in_ranking,
  public_profile,
  hide_ranking_name,
  preferred_sport_type
) on public.user_profiles to authenticated;

grant update (
  email,
  reflab_name,
  first_name,
  last_name,
  country,
  city,
  association,
  association_id,
  referee_type,
  main_role,
  referee_role,
  category,
  level,
  birth_date,
  ranking_display_name,
  show_real_name_in_ranking,
  public_profile,
  hide_ranking_name,
  preferred_sport_type
) on public.user_profiles to authenticated;

-- Institution core.
create policy institutions_member_read
on public.institutions
for select
to authenticated
using (
  reflab_private.has_active_institution_membership(id)
  or reflab_private.is_super_admin()
);

create policy institution_subscriptions_member_read
on public.institution_subscriptions
for select
to authenticated
using (
  reflab_private.has_active_institution_membership(institution_id)
  or reflab_private.is_super_admin()
);

create policy institution_permissions_member_read
on public.institution_permissions
for select
to authenticated
using (true);

create policy institution_roles_member_read
on public.institution_roles
for select
to authenticated
using (
  institution_id is null
  or reflab_private.has_active_institution_membership(institution_id)
  or reflab_private.is_super_admin()
);

create policy institution_role_permissions_member_read
on public.institution_role_permissions
for select
to authenticated
using (
  institution_id is null
  or reflab_private.has_active_institution_membership(institution_id)
  or reflab_private.is_super_admin()
);

create policy institution_memberships_scoped_read
on public.institution_memberships
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.has_institution_permission(institution_id, 'members.read')
  or reflab_private.is_super_admin()
);

create policy institution_membership_roles_scoped_read
on public.institution_membership_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.institution_memberships membership
    where membership.id = institution_membership_roles.membership_id
      and membership.user_id = reflab_private.request_user_id()
  )
  or reflab_private.has_institution_permission(institution_id, 'roles.read')
  or reflab_private.is_super_admin()
);

create policy institution_permission_overrides_scoped_read
on public.institution_membership_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.institution_memberships membership
    where membership.id =
      institution_membership_permission_overrides.membership_id
      and membership.user_id = reflab_private.request_user_id()
  )
  or reflab_private.has_institution_permission(institution_id, 'roles.read')
  or reflab_private.is_super_admin()
);

create policy institution_members_legacy_scoped_read
on public.institution_members
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.has_institution_permission(institution_id, 'members.read')
  or reflab_private.is_super_admin()
);

grant select on table
  public.institutions,
  public.institution_subscriptions,
  public.institution_permissions,
  public.institution_roles,
  public.institution_role_permissions,
  public.institution_memberships,
  public.institution_membership_roles,
  public.institution_membership_permission_overrides,
  public.institution_members
to authenticated;

-- Institution-scoped learning and operations. Mutations remain server-only.
create policy institution_cohorts_scoped_read
on public.institution_cohorts
for select
to authenticated
using (
  reflab_private.has_institution_permission(institution_id, 'groups.read')
  or reflab_private.is_super_admin()
);

create policy institution_groups_scoped_read
on public.institution_groups
for select
to authenticated
using (
  reflab_private.has_institution_permission(institution_id, 'groups.read')
  or reflab_private.is_super_admin()
);

create policy institution_group_memberships_scoped_read
on public.institution_group_memberships
for select
to authenticated
using (
  exists (
    select 1
    from public.institution_memberships membership
    where membership.id = institution_group_memberships.membership_id
      and membership.user_id = reflab_private.request_user_id()
  )
  or reflab_private.has_institution_permission(institution_id, 'groups.read')
  or reflab_private.is_super_admin()
);

create policy institution_contents_scoped_read
on public.institution_contents
for select
to authenticated
using (
  (
    status = 'published'
    and visibility = 'public'
  )
  or reflab_private.has_institution_permission(institution_id, 'content.read')
  or reflab_private.is_super_admin()
);

create policy institution_content_assignments_scoped_read
on public.institution_content_assignments
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or exists (
    select 1
    from public.institution_group_memberships group_membership
    join public.institution_memberships membership
      on membership.id = group_membership.membership_id
    where group_membership.group_id =
      institution_content_assignments.group_id
      and group_membership.status = 'active'
      and membership.user_id = reflab_private.request_user_id()
      and membership.status = 'active'
  )
  or reflab_private.has_institution_permission(institution_id, 'content.read')
  or reflab_private.is_super_admin()
);

create policy institutional_clips_scoped_read
on public.institutional_clips
for select
to authenticated
using (
  (is_public and status = 'published')
  or (
    institution_id is not null
    and reflab_private.has_institution_permission(institution_id, 'content.read')
  )
  or reflab_private.is_super_admin()
);

create policy institution_assessments_scoped_read
on public.institution_assessments
for select
to authenticated
using (
  reflab_private.has_institution_permission(institution_id, 'assessments.read')
  or reflab_private.is_super_admin()
);

create policy institution_assessment_items_scoped_read
on public.institution_assessment_items
for select
to authenticated
using (
  reflab_private.has_institution_permission(institution_id, 'assessments.read')
  or reflab_private.is_super_admin()
);

create policy institution_assessment_assignments_scoped_read
on public.institution_assessment_assignments
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or (
    group_id is not null
    and exists (
      select 1
      from public.institution_group_memberships group_membership
      join public.institution_memberships membership
        on membership.id = group_membership.membership_id
      where group_membership.group_id =
        institution_assessment_assignments.group_id
        and group_membership.status = 'active'
        and membership.user_id = reflab_private.request_user_id()
        and membership.status = 'active'
    )
  )
  or reflab_private.has_institution_permission(institution_id, 'assessments.read')
  or reflab_private.is_super_admin()
);

create policy institution_assessment_sessions_scoped_read
on public.institution_assessment_sessions
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.can_access_user_data(
    user_id,
    institution_id,
    'metrics.read_individual'
  )
  or reflab_private.is_super_admin()
);

create policy institution_assessment_feedback_scoped_read
on public.institution_assessment_feedback
for select
to authenticated
using (
  exists (
    select 1
    from public.institution_assessment_sessions assessment_session
    where assessment_session.id =
      institution_assessment_feedback.session_id
      and assessment_session.user_id =
        reflab_private.request_user_id()
  )
  or reflab_private.has_institution_permission(
    institution_id,
    'assessments.grade'
  )
  or reflab_private.is_super_admin()
);

create policy institution_assessment_history_manager_read
on public.institution_assessment_history
for select
to authenticated
using (
  reflab_private.has_institution_permission(
    institution_id,
    'assessments.manage'
  )
  or reflab_private.is_super_admin()
);

create policy institution_notification_campaigns_scoped_read
on public.institution_notification_campaigns
for select
to authenticated
using (
  reflab_private.has_institution_permission(
    institution_id,
    'notifications.read'
  )
  or reflab_private.is_super_admin()
);

create policy institution_notification_recipients_scoped_read
on public.institution_notification_recipients
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.has_institution_permission(
    institution_id,
    'notifications.read'
  )
  or reflab_private.is_super_admin()
);

create policy institution_data_consents_scoped_read
on public.institution_data_consents
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.has_institution_permission(
    institution_id,
    'institution.manage'
  )
  or reflab_private.is_super_admin()
);

create policy institution_data_consents_own_update
on public.institution_data_consents
for update
to authenticated
using (user_id = reflab_private.request_user_id())
with check (user_id = reflab_private.request_user_id());

create policy institution_audit_logs_authorized_read
on public.institution_audit_logs
for select
to authenticated
using (
  (
    institution_id is not null
    and reflab_private.has_institution_permission(institution_id, 'audit.read')
  )
  or reflab_private.is_super_admin()
);

create policy institution_demo_sessions_own_read
on public.institution_demo_sessions
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or reflab_private.is_super_admin()
);

grant select on table
  public.institution_cohorts,
  public.institution_groups,
  public.institution_group_memberships,
  public.institution_contents,
  public.institution_content_assignments,
  public.institutional_clips,
  public.institution_assessments,
  public.institution_assessment_items,
  public.institution_assessment_assignments,
  public.institution_assessment_sessions,
  public.institution_assessment_feedback,
  public.institution_assessment_history,
  public.institution_notification_campaigns,
  public.institution_notification_recipients,
  public.institution_data_consents,
  public.institution_audit_logs,
  public.institution_demo_sessions
to authenticated;

grant update on table public.institution_data_consents to authenticated;

-- Tables whose rows are owned directly by a Clerk user. Inserts and updates
-- may only preserve the effective JWT subject.
do $owned_read_write_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'appointments',
    'match_preparations',
    'post_match_reviews',
    'performance_checkins',
    'performance_sessions',
    'wellness_logs',
    'readiness_scores',
    'physical_tests',
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions',
    'coach_data_consents',
    'notification_preferences',
    'notification_tokens'
  ]::text[]
  loop
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (user_id = reflab_private.request_user_id() or reflab_private.is_super_admin())',
      table_name || '_own_read',
      table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = reflab_private.request_user_id())',
      table_name || '_own_insert',
      table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using (user_id = reflab_private.request_user_id()) with check (user_id = reflab_private.request_user_id())',
      table_name || '_own_update',
      table_name
    );
    execute pg_catalog.format(
      'grant select, insert, update on table public.%I to authenticated',
      table_name
    );
  end loop;
end
$owned_read_write_policies$;

-- Exam writes are server-only and atomic through submit_referee_exam.
do $owned_read_only_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'referee_exam_sessions',
    'exam_results',
    'attempts',
    'rules_exam_results',
    'referee_eligibility',
    'appointment_history',
    'notification_events',
    'coach_runs',
    'ai_usage_ledger'
  ]::text[]
  loop
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (user_id = reflab_private.request_user_id() or reflab_private.is_super_admin())',
      table_name || '_own_read',
      table_name
    );
    execute pg_catalog.format(
      'grant select on table public.%I to authenticated',
      table_name
    );
  end loop;
end
$owned_read_only_policies$;

create policy match_officials_own_read
on public.match_officials
for select
to authenticated
using (
  user_id = reflab_private.request_user_id()
  or exists (
    select 1
    from public.appointments appointment
    where appointment.id = match_officials.appointment_id
      and appointment.user_id = reflab_private.request_user_id()
  )
  or reflab_private.is_super_admin()
);

grant select on table public.match_officials to authenticated;

create policy coach_evidence_own_read
on public.coach_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.coach_runs run
    where run.id = coach_evidence.run_id
      and (
        run.user_id = reflab_private.request_user_id()
        or reflab_private.is_super_admin()
      )
  )
);

grant select on table public.coach_evidence to authenticated;

-- CRM and provider synchronization remain server-only. Super Admin can audit
-- them through authenticated reads without receiving direct write grants.
create policy institutional_leads_super_admin_read
on public.institutional_leads
for select
to authenticated
using (reflab_private.is_super_admin());

create policy institutional_lead_activities_super_admin_read
on public.institutional_lead_activities
for select
to authenticated
using (reflab_private.is_super_admin());

grant select on table
  public.institutional_leads,
  public.institutional_lead_activities
to authenticated;

-- ---------------------------------------------------------------------------
-- Cross-module context validation
-- ---------------------------------------------------------------------------

create function reflab_private.validate_institution_role_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  role_institution_id uuid;
  membership_institution_id uuid;
begin
  select role.institution_id
  into role_institution_id
  from public.institution_roles role
  where role.id = new.role_id;

  if not found then
    raise exception 'institution role does not exist';
  end if;

  if tg_table_name = 'institution_membership_roles' then
    select membership.institution_id
    into membership_institution_id
    from public.institution_memberships membership
    where membership.id = new.membership_id;

    if not found or membership_institution_id <> new.institution_id then
      raise exception 'membership and role assignment institutions do not match';
    end if;

    if role_institution_id is not null
       and role_institution_id <> new.institution_id then
      raise exception 'institution role belongs to another institution';
    end if;
  elsif tg_table_name = 'institution_role_permissions' then
    if role_institution_id is distinct from new.institution_id then
      raise exception 'role permission institution does not match its role';
    end if;
  else
    raise exception 'unsupported role-scope validation table: %', tg_table_name;
  end if;

  return new;
end
$function$;

create function reflab_private.validate_institution_user_target()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.institution_memberships membership
    where membership.institution_id = new.institution_id
      and membership.user_id = new.user_id
      and membership.status = 'active'
  ) then
    raise exception 'target user does not have an active institution membership';
  end if;

  return new;
end
$function$;

create function reflab_private.validate_assessment_session_assignment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  assignment public.institution_assessment_assignments%rowtype;
begin
  select *
  into assignment
  from public.institution_assessment_assignments assignment_row
  where assignment_row.id = new.assignment_id;

  if not found
     or assignment.institution_id <> new.institution_id
     or assignment.assessment_id <> new.assessment_id then
    raise exception 'assessment session assignment context is invalid';
  end if;

  if assignment.user_id is not null then
    if assignment.user_id <> new.user_id or new.group_id is not null then
      raise exception 'assessment session does not match its direct user assignment';
    end if;
  else
    if assignment.group_id is null
       or assignment.group_id is distinct from new.group_id
       or not exists (
         select 1
         from public.institution_memberships membership
         join public.institution_group_memberships group_membership
           on group_membership.membership_id = membership.id
          and group_membership.institution_id = membership.institution_id
          and group_membership.status = 'active'
         where membership.institution_id = new.institution_id
           and membership.user_id = new.user_id
           and membership.status = 'active'
           and group_membership.group_id = new.group_id
       ) then
      raise exception 'assessment session user is not assigned to the institution group';
    end if;
  end if;

  return new;
end
$function$;

create function reflab_private.validate_institution_data_consent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from public.institution_memberships membership
    where membership.id = new.membership_id
      and membership.institution_id = new.institution_id
      and membership.user_id = new.user_id
  ) then
    raise exception 'data consent does not match its institution membership';
  end if;

  return new;
end
$function$;

create function reflab_private.validate_referee_exam_session_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.context_type = 'individual' then
    return new;
  end if;

  if not exists (
    select 1
    from public.institution_assessment_sessions assessment_session
    join public.institution_assessments assessment
      on assessment.id = assessment_session.assessment_id
     and assessment.institution_id = assessment_session.institution_id
    where assessment_session.id = new.institution_assessment_session_id
      and assessment_session.institution_id = new.institution_id
      and assessment_session.user_id = new.user_id
      and assessment_session.group_id is not distinct from new.institution_group_id
      and assessment.sport_type = new.sport_type
  ) then
    raise exception 'referee exam session institutional context is invalid';
  end if;

  return new;
end
$function$;

create function reflab_private.validate_exam_result_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  exam_session public.referee_exam_sessions%rowtype;
begin
  select *
  into exam_session
  from public.referee_exam_sessions session_row
  where session_row.id = new.exam_session_id;

  if not found
     or exam_session.user_id <> new.user_id
     or exam_session.submission_id <> new.submission_id
     or exam_session.sport_type <> new.sport_type
     or exam_session.activity_type <> new.activity_type
     or exam_session.institution_id is distinct from new.institution_id
     or exam_session.institution_group_id is distinct from new.institution_group_id
     or exam_session.institution_assessment_session_id is distinct from
        new.institution_assessment_session_id then
    raise exception 'exam result context does not match its referee exam session';
  end if;

  return new;
end
$function$;

create function reflab_private.validate_attempt_exam_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  exam_result public.exam_results%rowtype;
begin
  if new.exam_result_id is null then
    return new;
  end if;

  select *
  into exam_result
  from public.exam_results result_row
  where result_row.id = new.exam_result_id;

  if not found
     or exam_result.user_id <> new.user_id
     or exam_result.submission_id <> new.submission_id
     or exam_result.sport_type <> new.sport_type
     or exam_result.institution_id is distinct from new.institution_id
     or exam_result.institution_group_id is distinct from new.institution_group_id
     or exam_result.institution_assessment_session_id is distinct from
        new.institution_assessment_session_id then
    raise exception 'attempt context does not match its exam result';
  end if;

  return new;
end
$function$;

create function reflab_private.validate_user_appointment_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  appointment_user_id text;
  appointment_fixture_id uuid;
  appointment_sport_type text;
begin
  if new.appointment_id is null then
    return new;
  end if;

  select
    appointment.user_id,
    appointment.fixture_id,
    appointment.sport_type
  into
    appointment_user_id,
    appointment_fixture_id,
    appointment_sport_type
  from public.appointments appointment
  where appointment.id = new.appointment_id;

  if not found then
    raise exception 'appointment context is unavailable';
  end if;

  if appointment_user_id <> new.user_id then
    raise exception 'appointment does not belong to the row user';
  end if;

  if new.fixture_id is not null
     and new.fixture_id <> appointment_fixture_id then
    raise exception 'fixture does not match the appointment';
  end if;

  if new.sport_type is not null
     and new.sport_type <> appointment_sport_type then
    raise exception 'sport_type does not match the appointment';
  end if;

  return new;
end
$function$;

do $appointment_context_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'performance_checkins',
    'performance_sessions',
    'wellness_logs',
    'readiness_scores',
    'psychology_checkins',
    'psychology_exercise_sessions',
    'notification_events'
  ]::text[]
  loop
    execute pg_catalog.format(
      'create trigger %I before insert or update on public.%I for each row execute function reflab_private.validate_user_appointment_context()',
      table_name || '_validate_appointment_context',
      table_name
    );
  end loop;
end
$appointment_context_triggers$;

-- match_preparations and post_match_reviews derive fixture context through the
-- appointment but do not persist fixture_id.
create function reflab_private.validate_owned_appointment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from public.appointments appointment
    where appointment.id = new.appointment_id
      and appointment.user_id = new.user_id
      and appointment.sport_type = new.sport_type
  ) then
    raise exception 'appointment does not match the row owner and discipline';
  end if;

  return new;
end
$function$;

create function reflab_private.validate_performance_checkin_owner()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.checkin_id is not null
     and not exists (
       select 1
       from public.performance_checkins checkin
       where checkin.id = new.checkin_id
         and checkin.user_id = new.user_id
     ) then
    raise exception 'performance check-in does not belong to the row user';
  end if;

  return new;
end
$function$;

do $performance_checkin_context_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'performance_sessions',
    'wellness_logs',
    'readiness_scores'
  ]::text[]
  loop
    execute pg_catalog.format(
      'create trigger %I before insert or update on public.%I for each row execute function reflab_private.validate_performance_checkin_owner()',
      table_name || '_validate_checkin_owner',
      table_name
    );
  end loop;
end
$performance_checkin_context_triggers$;

create trigger match_preparations_validate_appointment
before insert or update on public.match_preparations
for each row execute function reflab_private.validate_owned_appointment();

create trigger post_match_reviews_validate_appointment
before insert or update on public.post_match_reviews
for each row execute function reflab_private.validate_owned_appointment();

create trigger institution_membership_roles_validate_scope
before insert or update on public.institution_membership_roles
for each row execute function reflab_private.validate_institution_role_scope();

create trigger institution_role_permissions_validate_scope
before insert or update on public.institution_role_permissions
for each row execute function reflab_private.validate_institution_role_scope();

create trigger institution_content_assignments_validate_user
before insert or update on public.institution_content_assignments
for each row execute function reflab_private.validate_institution_user_target();

create trigger institution_assessment_assignments_validate_user
before insert or update on public.institution_assessment_assignments
for each row execute function reflab_private.validate_institution_user_target();

create trigger institution_notification_recipients_validate_user
before insert or update on public.institution_notification_recipients
for each row execute function reflab_private.validate_institution_user_target();

create trigger institution_assessment_sessions_validate_assignment
before insert or update on public.institution_assessment_sessions
for each row execute function reflab_private.validate_assessment_session_assignment();

create trigger institution_data_consents_validate_membership
before insert or update on public.institution_data_consents
for each row execute function reflab_private.validate_institution_data_consent();

create trigger referee_exam_sessions_validate_context
before insert on public.referee_exam_sessions
for each row execute function reflab_private.validate_referee_exam_session_context();

create trigger exam_results_validate_context
before insert on public.exam_results
for each row execute function reflab_private.validate_exam_result_context();

create trigger attempts_validate_exam_context
before insert or update of exam_result_id, user_id, submission_id, sport_type,
  institution_id, institution_group_id, institution_assessment_session_id
on public.attempts
for each row execute function reflab_private.validate_attempt_exam_context();

revoke all on function reflab_private.set_updated_at()
  from public, anon, authenticated;
revoke all on function reflab_private.canonical_jsonb_text(jsonb)
  from public, anon, authenticated;
revoke all on function reflab_private.validate_referee_exam_manifest()
  from public, anon, authenticated;
revoke all on function reflab_private.protect_referee_exam_session()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_user_appointment_context()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_owned_appointment()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_performance_checkin_owner()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_institution_role_scope()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_institution_user_target()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_assessment_session_assignment()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_institution_data_consent()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_referee_exam_session_context()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_exam_result_context()
  from public, anon, authenticated;
revoke all on function reflab_private.validate_attempt_exam_context()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets and policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'Videos',
    'Videos',
    true,
    104857600,
    array['video/mp4', 'video/quicktime', 'video/webm']::text[]
  ),
  (
    'Videos Modo Ingles',
    'Videos Modo Ingles',
    true,
    104857600,
    array['video/mp4', 'video/quicktime', 'video/webm']::text[]
  ),
  (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'institutional-content',
    'institutional-content',
    false,
    104857600,
    array[
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/webm'
    ]::text[]
  );

create policy videos_public_read
on storage.objects
for select
to public
using (bucket_id in ('Videos', 'Videos Modo Ingles'));

create policy avatars_public_read
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy institutional_content_authenticated_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'institutional-content'
  and (storage.foldername(name))[1]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and reflab_private.has_institution_permission(
    ((storage.foldername(name))[1])::uuid,
    'content.read'
  )
);

-- There are intentionally no INSERT, UPDATE or DELETE policies on
-- storage.objects for anon or authenticated. All writes are server-only.

-- ---------------------------------------------------------------------------
-- Canonical installation marker
-- ---------------------------------------------------------------------------

create table reflab_meta.reflab_schema_state (
  installation_id uuid primary key default gen_random_uuid(),
  baseline_version text not null unique,
  sql_checksum text not null
    check (sql_checksum ~ '^[0-9a-f]{64}$'),
  manifest_hash text not null
    check (manifest_hash ~ '^[0-9a-f]{64}$'),
  environment text not null
    check (environment in ('development', 'test', 'preview', 'staging', 'production')),
  installed_at timestamptz not null default now(),
  postgres_version text not null,
  supabase_platform_version text,
  schema_version integer not null check (schema_version > 0),
  installation_status text not null check (installation_status = 'installed'),
  constraint reflab_schema_state_singleton unique (installation_status)
);

create function reflab_meta.reject_schema_state_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'reflab_schema_state is immutable';
end
$function$;

create trigger reflab_schema_state_immutable
before update or delete on reflab_meta.reflab_schema_state
for each row execute function reflab_meta.reject_schema_state_mutation();

alter table reflab_meta.reflab_schema_state enable row level security;
revoke all on table reflab_meta.reflab_schema_state
  from public, anon, authenticated;
grant select on table reflab_meta.reflab_schema_state to service_role;
revoke all on function reflab_meta.reject_schema_state_mutation()
  from public, anon, authenticated;

-- Hashes are finalized by the static baseline validation script. The SQL hash
-- is calculated after normalizing this literal to 64 zeroes to avoid a
-- self-referential checksum.
insert into reflab_meta.reflab_schema_state (
  baseline_version,
  sql_checksum,
  manifest_hash,
  environment,
  postgres_version,
  supabase_platform_version,
  schema_version,
  installation_status
)
values (
  '202607270000',
  '283fe6df8a83e9037753a49b19e48282dd4d27df9d13035063d262cf80ea3839',
  '0125fbf5a33accc73b218a51f09cbef2c108d5f4235ff68a00f271904ea25844',
  coalesce(
    nullif(pg_catalog.current_setting('reflab.installation_environment', true), ''),
    'development'
  ),
  pg_catalog.current_setting('server_version'),
  null,
  1,
  'installed'
);

-- ---------------------------------------------------------------------------
-- Installation assertions
-- ---------------------------------------------------------------------------

do $baseline_assertions$
declare
  product_table_count integer;
  rls_table_count integer;
  anon_table_grant_count integer;
  unsafe_storage_write_policy_count integer;
  rls_helper_owner_count integer;
  rls_owner_record record;
begin
  select count(*)
  into product_table_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and relation.relname <> 'spatial_ref_sys';

  if product_table_count <> 79 then
    raise exception
      'Canonical baseline expected 79 public product tables, found %',
      product_table_count;
  end if;

  select count(*)
  into rls_table_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and relation.relname <> 'spatial_ref_sys'
    and relation.relrowsecurity;

  if rls_table_count <> product_table_count then
    raise exception
      'Every public product table must have RLS enabled';
  end if;

  select count(*)
  into anon_table_grant_count
  from information_schema.role_table_grants grant_row
  where grant_row.table_schema = 'public'
    and grant_row.grantee in ('anon', 'PUBLIC')
    and grant_row.table_name <> 'spatial_ref_sys';

  if anon_table_grant_count > 0 then
    raise exception 'Anonymous table grants remain after baseline installation';
  end if;

  select count(*)
  into unsafe_storage_write_policy_count
  from pg_catalog.pg_policies policy
  where policy.schemaname = 'storage'
    and policy.tablename = 'objects'
    and policy.cmd in ('INSERT', 'UPDATE', 'DELETE')
    and (
      'anon' = any (policy.roles)
      or 'public' = any (policy.roles)
      or 'authenticated' = any (policy.roles)
    );

  if unsafe_storage_write_policy_count > 0 then
    raise exception 'Unsafe browser storage write policies remain';
  end if;

  select
    role.rolcanlogin,
    role.rolsuper,
    role.rolcreatedb,
    role.rolcreaterole,
    role.rolinherit,
    role.rolbypassrls
  into rls_owner_record
  from pg_catalog.pg_roles role
  where role.rolname = 'reflab_rls_owner';

  if not found
     or rls_owner_record.rolcanlogin
     or rls_owner_record.rolsuper
     or rls_owner_record.rolcreatedb
     or rls_owner_record.rolcreaterole
     or rls_owner_record.rolinherit
     or rls_owner_record.rolbypassrls then
    raise exception 'reflab_rls_owner attributes are unsafe or incompatible';
  end if;

  if not pg_catalog.pg_has_role(
    'postgres',
    'reflab_rls_owner',
    'MEMBER'
  ) then
    raise exception 'postgres is not a member of reflab_rls_owner';
  end if;

  if pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'reflab_private',
    'CREATE'
  ) then
    raise exception 'reflab_rls_owner retained CREATE on reflab_private';
  end if;

  select count(*)
  into rls_helper_owner_count
  from pg_catalog.pg_proc function_row
  join pg_catalog.pg_namespace namespace
    on namespace.oid = function_row.pronamespace
  join pg_catalog.pg_roles owner_role
    on owner_role.oid = function_row.proowner
  where namespace.nspname = 'reflab_private'
    and function_row.proname in (
      'is_super_admin',
      'has_active_institution_membership',
      'has_institution_permission',
      'can_access_user_data'
    )
    and owner_role.rolname = 'reflab_rls_owner';

  if rls_helper_owner_count <> 4 then
    raise exception
      'Expected 4 RLS helpers owned by reflab_rls_owner, found %',
      rls_helper_owner_count;
  end if;
end
$baseline_assertions$;

notify pgrst, 'reload schema';

commit;
