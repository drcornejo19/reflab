begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.institutions
  add column if not exists institution_type text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists slug text,
  add column if not exists province_state text,
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires',
  add column if not exists logo_url text,
  add column if not exists brand_color text not null default '#6fc11f',
  add column if not exists domain text,
  add column if not exists subdomain text,
  add column if not exists institutional_email text,
  add column if not exists responsible_name text,
  add column if not exists plan_key text not null default 'pilot',
  add column if not exists license_limit integer not null default 0,
  add column if not exists enabled_sports text[] not null default array['football_11']::text[],
  add column if not exists privacy_settings jsonb not null default '{}'::jsonb,
  add column if not exists assessment_settings jsonb not null default '{}'::jsonb,
  add column if not exists metrics_settings jsonb not null default '{}'::jsonb,
  add column if not exists is_demo boolean not null default false,
  add column if not exists created_by_user_id text,
  add column if not exists deleted_at timestamptz;

update public.institutions
set slug = coalesce(
  nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
  'institution'
) || '-' || left(replace(id::text, '-', ''), 8)
where slug is null or btrim(slug) = '';

update public.institutions
set institution_type = 'other'
where institution_type is null
   or institution_type not in (
     'school',
     'league',
     'association',
     'federation',
     'private_academy',
     'other'
   );

update public.institutions
set status = 'pending'
where status is null
   or status not in ('pending', 'active', 'suspended', 'archived');

alter table if exists public.institutions
  alter column slug set not null,
  drop constraint if exists institutions_institution_type_check,
  drop constraint if exists institutions_status_check,
  drop constraint if exists institutions_license_limit_check,
  drop constraint if exists institutions_enabled_sports_check,
  drop constraint if exists institutions_privacy_settings_object_check,
  drop constraint if exists institutions_assessment_settings_object_check,
  drop constraint if exists institutions_metrics_settings_object_check,
  drop constraint if exists institutions_brand_color_check;

alter table if exists public.institutions
  add constraint institutions_institution_type_check check (
    institution_type in (
      'school',
      'league',
      'association',
      'federation',
      'private_academy',
      'other'
    )
  ),
  add constraint institutions_status_check check (
    status in ('pending', 'active', 'suspended', 'archived')
  ),
  add constraint institutions_license_limit_check check (license_limit >= 0),
  add constraint institutions_enabled_sports_check check (
    cardinality(enabled_sports) > 0
    and enabled_sports <@ array['football_11', 'futsal']::text[]
  ),
  add constraint institutions_privacy_settings_object_check check (
    jsonb_typeof(privacy_settings) = 'object'
  ),
  add constraint institutions_assessment_settings_object_check check (
    jsonb_typeof(assessment_settings) = 'object'
  ),
  add constraint institutions_metrics_settings_object_check check (
    jsonb_typeof(metrics_settings) = 'object'
  ),
  add constraint institutions_brand_color_check check (
    brand_color ~ '^#[0-9A-Fa-f]{6}$'
  );

create unique index if not exists institutions_slug_unique
  on public.institutions (lower(slug));

create unique index if not exists institutions_domain_unique
  on public.institutions (lower(domain))
  where domain is not null and btrim(domain) <> '';

create unique index if not exists institutions_subdomain_unique
  on public.institutions (lower(subdomain))
  where subdomain is not null and btrim(subdomain) <> '';

create index if not exists institutions_status_demo_idx
  on public.institutions (status, is_demo);

create table if not exists public.institution_permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  name text not null,
  description text,
  permission_scope text not null default 'institution',
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institution_roles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_assignable boolean not null default true,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists institution_roles_system_key_unique
  on public.institution_roles (role_key)
  where institution_id is null;

create unique index if not exists institution_roles_tenant_key_unique
  on public.institution_roles (institution_id, role_key)
  where institution_id is not null;

create table if not exists public.institution_role_permissions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete cascade,
  role_id uuid not null references public.institution_roles(id) on delete cascade,
  permission_id uuid not null references public.institution_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint institution_role_permissions_unique unique (role_id, permission_id)
);

create table if not exists public.institution_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id text not null,
  status text not null default 'active' check (
    status in ('invited', 'active', 'suspended', 'revoked')
  ),
  primary_sport text check (
    primary_sport is null or primary_sport in ('football_11', 'futsal')
  ),
  category text,
  joined_at timestamptz,
  invited_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  last_active_at timestamptz,
  invited_by_user_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_memberships_unique unique (institution_id, user_id),
  constraint institution_memberships_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create table if not exists public.institution_membership_roles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  membership_id uuid not null references public.institution_memberships(id) on delete cascade,
  role_id uuid not null references public.institution_roles(id) on delete cascade,
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  constraint institution_membership_roles_unique unique (membership_id, role_id)
);

create table if not exists public.institution_membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  membership_id uuid not null references public.institution_memberships(id) on delete cascade,
  permission_id uuid not null references public.institution_permissions(id) on delete cascade,
  allowed boolean not null,
  reason text,
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_membership_permission_overrides_unique unique (
    membership_id,
    permission_id
  )
);

-- Production may still have the first institutional schema, where the legacy
-- membership table did not include updated_at. Keep it available for the
-- compatibility backfill while institution_memberships becomes canonical.
alter table if exists public.institution_members
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.user_roles
  add column if not exists institution_id uuid references public.institutions(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

insert into public.institution_permissions (
  permission_key,
  name,
  permission_scope,
  is_sensitive
)
values
  ('institution.read', 'Ver institucion', 'institution', false),
  ('institution.manage', 'Configurar institucion', 'institution', true),
  ('members.read', 'Ver miembros', 'members', false),
  ('members.manage', 'Administrar miembros', 'members', true),
  ('members.invite', 'Invitar miembros', 'members', true),
  ('roles.read', 'Ver roles', 'roles', false),
  ('roles.manage', 'Administrar roles', 'roles', true),
  ('groups.read', 'Ver grupos', 'groups', false),
  ('groups.manage', 'Administrar grupos', 'groups', true),
  ('courses.read', 'Ver cursos', 'courses', false),
  ('courses.manage', 'Administrar cursos', 'courses', true),
  ('content.read', 'Ver contenido', 'content', false),
  ('content.manage', 'Administrar contenido', 'content', true),
  ('content.publish', 'Publicar contenido', 'content', true),
  ('assessments.read', 'Ver evaluaciones', 'assessments', false),
  ('assessments.take', 'Rendir evaluaciones', 'assessments', false),
  ('assessments.manage', 'Administrar evaluaciones', 'assessments', true),
  ('assessments.grade', 'Corregir evaluaciones', 'assessments', true),
  ('metrics.read_own', 'Ver metricas propias', 'metrics', false),
  ('metrics.read_individual', 'Ver metricas individuales', 'metrics', true),
  ('metrics.read_aggregate', 'Ver metricas agregadas', 'metrics', true),
  ('reports.read', 'Ver reportes', 'reports', true),
  ('reports.export', 'Exportar reportes', 'reports', true),
  ('notifications.read', 'Ver notificaciones', 'notifications', false),
  ('notifications.send', 'Enviar notificaciones', 'notifications', true),
  ('attendance.read', 'Ver asistencia', 'attendance', true),
  ('attendance.manage', 'Administrar asistencia', 'attendance', true),
  ('matches.read', 'Ver designaciones', 'matches', false),
  ('matches.manage', 'Administrar designaciones', 'matches', true),
  ('psychology.compliance.read', 'Ver cumplimiento psicologico', 'psychology', true),
  ('psychology.detail.read', 'Ver detalle psicologico autorizado', 'psychology', true),
  ('performance.summary.read', 'Ver resumen fisico', 'performance', true),
  ('performance.detail.read', 'Ver detalle fisico autorizado', 'performance', true),
  ('privacy.consents.read', 'Ver consentimientos', 'privacy', true),
  ('audit.read', 'Ver auditoria', 'audit', true),
  ('demo.switch', 'Simular rol demo', 'demo', true),
  ('licenses.read', 'Ver licencias', 'licenses', true),
  ('licenses.manage', 'Administrar licencias', 'licenses', true)
on conflict (permission_key) do update set
  name = excluded.name,
  permission_scope = excluded.permission_scope,
  is_sensitive = excluded.is_sensitive,
  updated_at = now();

insert into public.institution_roles (
  institution_id,
  role_key,
  name,
  description,
  is_system,
  is_assignable
)
values
  (null, 'institution_admin', 'Administrador institucional', 'Control total del tenant institucional.', true, true),
  (null, 'technical_coordinator', 'Coordinador tecnico', 'Coordina grupos, evaluaciones y metricas.', true, true),
  (null, 'instructor', 'Instructor', 'Gestiona sus grupos, actividades y devoluciones.', true, true),
  (null, 'evaluator', 'Evaluador', 'Corrige y analiza evaluaciones asignadas.', true, true),
  (null, 'physical_trainer', 'Preparador fisico', 'Consulta y gestiona informacion fisica autorizada.', true, true),
  (null, 'institution_psychologist', 'Psicologo institucional', 'Accede a informacion psicologica expresamente autorizada.', true, true),
  (null, 'content_manager', 'Responsable de contenidos', 'Gestiona contenidos y publicaciones.', true, true),
  (null, 'student', 'Alumno', 'Accede a su programa y actividad asignada.', true, true),
  (null, 'referee', 'Arbitro', 'Accede a capacitacion y evaluaciones institucionales.', true, true),
  (null, 'invited_referee', 'Arbitro invitado', 'Acceso temporal a actividades asignadas.', true, true),
  (null, 'observer', 'Observador', 'Consulta informacion institucional permitida.', true, true),
  (null, 'read_only', 'Solo lectura', 'Acceso institucional sin operaciones de escritura.', true, true)
on conflict (role_key) where institution_id is null do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  is_assignable = excluded.is_assignable,
  updated_at = now();

insert into public.institution_role_permissions (
  institution_id,
  role_id,
  permission_id
)
select null, role_row.id, permission_row.id
from public.institution_roles role_row
cross join public.institution_permissions permission_row
where role_row.institution_id is null
  and role_row.role_key = 'institution_admin'
on conflict (role_id, permission_id) do nothing;

with role_permission_map(role_key, permission_key) as (
  values
    ('technical_coordinator', 'institution.read'),
    ('technical_coordinator', 'members.read'),
    ('technical_coordinator', 'groups.read'),
    ('technical_coordinator', 'groups.manage'),
    ('technical_coordinator', 'courses.read'),
    ('technical_coordinator', 'courses.manage'),
    ('technical_coordinator', 'content.read'),
    ('technical_coordinator', 'content.manage'),
    ('technical_coordinator', 'assessments.read'),
    ('technical_coordinator', 'assessments.manage'),
    ('technical_coordinator', 'assessments.grade'),
    ('technical_coordinator', 'metrics.read_individual'),
    ('technical_coordinator', 'metrics.read_aggregate'),
    ('technical_coordinator', 'reports.read'),
    ('technical_coordinator', 'notifications.read'),
    ('technical_coordinator', 'notifications.send'),
    ('technical_coordinator', 'attendance.read'),
    ('technical_coordinator', 'matches.read'),
    ('technical_coordinator', 'matches.manage'),
    ('instructor', 'institution.read'),
    ('instructor', 'members.read'),
    ('instructor', 'groups.read'),
    ('instructor', 'courses.read'),
    ('instructor', 'content.read'),
    ('instructor', 'content.manage'),
    ('instructor', 'assessments.read'),
    ('instructor', 'assessments.manage'),
    ('instructor', 'assessments.grade'),
    ('instructor', 'metrics.read_individual'),
    ('instructor', 'notifications.read'),
    ('instructor', 'attendance.read'),
    ('instructor', 'attendance.manage'),
    ('evaluator', 'institution.read'),
    ('evaluator', 'groups.read'),
    ('evaluator', 'assessments.read'),
    ('evaluator', 'assessments.grade'),
    ('evaluator', 'metrics.read_individual'),
    ('physical_trainer', 'institution.read'),
    ('physical_trainer', 'members.read'),
    ('physical_trainer', 'groups.read'),
    ('physical_trainer', 'performance.summary.read'),
    ('physical_trainer', 'performance.detail.read'),
    ('institution_psychologist', 'institution.read'),
    ('institution_psychologist', 'members.read'),
    ('institution_psychologist', 'groups.read'),
    ('institution_psychologist', 'psychology.compliance.read'),
    ('institution_psychologist', 'psychology.detail.read'),
    ('content_manager', 'institution.read'),
    ('content_manager', 'content.read'),
    ('content_manager', 'content.manage'),
    ('content_manager', 'content.publish'),
    ('student', 'institution.read'),
    ('student', 'courses.read'),
    ('student', 'content.read'),
    ('student', 'assessments.read'),
    ('student', 'assessments.take'),
    ('student', 'metrics.read_own'),
    ('student', 'notifications.read'),
    ('referee', 'institution.read'),
    ('referee', 'courses.read'),
    ('referee', 'content.read'),
    ('referee', 'assessments.read'),
    ('referee', 'assessments.take'),
    ('referee', 'metrics.read_own'),
    ('referee', 'notifications.read'),
    ('referee', 'matches.read'),
    ('invited_referee', 'institution.read'),
    ('invited_referee', 'courses.read'),
    ('invited_referee', 'content.read'),
    ('invited_referee', 'assessments.read'),
    ('invited_referee', 'assessments.take'),
    ('observer', 'institution.read'),
    ('observer', 'groups.read'),
    ('observer', 'metrics.read_aggregate'),
    ('observer', 'reports.read'),
    ('read_only', 'institution.read'),
    ('read_only', 'content.read'),
    ('read_only', 'assessments.read'),
    ('read_only', 'notifications.read')
)
insert into public.institution_role_permissions (
  institution_id,
  role_id,
  permission_id
)
select null, role_row.id, permission_row.id
from role_permission_map mapping
join public.institution_roles role_row
  on role_row.role_key = mapping.role_key
 and role_row.institution_id is null
join public.institution_permissions permission_row
  on permission_row.permission_key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

insert into public.institution_memberships (
  institution_id,
  user_id,
  status,
  joined_at,
  metadata,
  created_at,
  updated_at
)
select
  member.institution_id,
  member.user_id,
  case
    when member.status = 'active' then 'active'
    when member.status = 'invited' then 'invited'
    when member.status = 'revoked' then 'revoked'
    else 'suspended'
  end,
  member.created_at,
  jsonb_build_object('legacy_role', member.role, 'legacy_cohort', member.cohort),
  member.created_at,
  coalesce(member.updated_at, member.created_at)
from public.institution_members member
where member.user_id is not null
  and btrim(member.user_id) <> ''
on conflict (institution_id, user_id) do update set
  status = excluded.status,
  metadata = public.institution_memberships.metadata || excluded.metadata,
  updated_at = greatest(public.institution_memberships.updated_at, excluded.updated_at);

insert into public.institution_memberships (
  institution_id,
  user_id,
  status,
  joined_at,
  metadata
)
select
  role_row.institution_id,
  role_row.user_id,
  'active',
  role_row.created_at,
  jsonb_build_object('legacy_global_role', role_row.role)
from public.user_roles role_row
where role_row.institution_id is not null
  and role_row.user_id is not null
  and btrim(role_row.user_id) <> ''
on conflict (institution_id, user_id) do nothing;

insert into public.institution_membership_roles (
  institution_id,
  membership_id,
  role_id
)
select
  membership.institution_id,
  membership.id,
  role_row.id
from public.institution_memberships membership
join public.institution_members legacy
  on legacy.institution_id = membership.institution_id
 and legacy.user_id = membership.user_id
join public.institution_roles role_row
  on role_row.institution_id is null
 and role_row.role_key = case
   when legacy.role in ('super_admin', 'institution_admin') then 'institution_admin'
   when legacy.role in ('institutional_instructor', 'instructor') then 'instructor'
   when legacy.role = 'institutional_student' then 'student'
   else 'referee'
 end
on conflict (membership_id, role_id) do nothing;

insert into public.institution_membership_roles (
  institution_id,
  membership_id,
  role_id
)
select
  membership.institution_id,
  membership.id,
  institution_role.id
from public.institution_memberships membership
join public.user_roles legacy_role
  on legacy_role.institution_id = membership.institution_id
 and legacy_role.user_id = membership.user_id
join public.institution_roles institution_role
  on institution_role.institution_id is null
 and institution_role.role_key = case
   when legacy_role.role in ('super_admin', 'institution_admin') then 'institution_admin'
   when legacy_role.role in ('institutional_instructor', 'instructor') then 'instructor'
   when legacy_role.role = 'institutional_student' then 'student'
   else 'referee'
 end
on conflict (membership_id, role_id) do nothing;

alter table if exists public.institution_programs
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists timezone text not null default 'America/Argentina/Buenos_Aires',
  add column if not exists category text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.institution_programs
  drop constraint if exists institution_programs_sport_type_check,
  drop constraint if exists institution_programs_metadata_object_check;

alter table if exists public.institution_programs
  add constraint institution_programs_sport_type_check check (
    sport_type in ('football_11', 'futsal')
  ),
  add constraint institution_programs_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  );

alter table if exists public.institution_program_items
  add column if not exists institution_id uuid references public.institutions(id) on delete cascade;

update public.institution_program_items item
set institution_id = program.institution_id
from public.institution_programs program
where program.id = item.program_id
  and item.institution_id is null;

create table if not exists public.institution_cohorts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  program_id uuid references public.institution_programs(id) on delete set null,
  name text not null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  season_label text,
  starts_on date,
  ends_on date,
  status text not null default 'draft' check (
    status in ('draft', 'active', 'paused', 'completed', 'archived')
  ),
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institution_groups (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  cohort_id uuid references public.institution_cohorts(id) on delete set null,
  program_id uuid references public.institution_programs(id) on delete set null,
  name text not null,
  description text,
  group_type text not null default 'training' check (
    group_type in ('course', 'cohort', 'commission', 'category', 'role', 'training', 'work_team')
  ),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  category text,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (
    status in ('draft', 'active', 'paused', 'completed', 'archived')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_groups_name_unique unique (institution_id, name),
  constraint institution_groups_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create table if not exists public.institution_group_memberships (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  group_id uuid not null references public.institution_groups(id) on delete cascade,
  membership_id uuid not null references public.institution_memberships(id) on delete cascade,
  group_role text not null default 'participant' check (
    group_role in ('participant', 'instructor', 'coordinator', 'observer')
  ),
  status text not null default 'active' check (
    status in ('active', 'completed', 'removed')
  ),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_group_memberships_unique unique (group_id, membership_id)
);

create table if not exists public.institution_contents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  content_type text not null check (
    content_type in ('video', 'question', 'trivia', 'document', 'circular', 'class', 'exercise', 'presentation', 'pdf', 'link', 'audio', 'case_study')
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
  visibility text not null default 'institution' check (
    visibility in ('private', 'institution', 'assigned_groups', 'public')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'published', 'archived', 'expired')
  ),
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint institution_contents_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create table if not exists public.institution_content_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  content_id uuid not null references public.institution_contents(id) on delete cascade,
  group_id uuid references public.institution_groups(id) on delete cascade,
  user_id text,
  assigned_by_user_id text not null,
  available_from timestamptz,
  due_at timestamptz,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  constraint institution_content_assignments_target_check check (
    (group_id is not null and user_id is null)
    or (group_id is null and user_id is not null)
  )
);

create unique index if not exists institution_content_assignments_group_unique
  on public.institution_content_assignments (content_id, group_id)
  where group_id is not null;

create unique index if not exists institution_content_assignments_user_unique
  on public.institution_content_assignments (content_id, user_id)
  where user_id is not null;

alter table if exists public.institutional_clips
  add column if not exists content_id uuid references public.institution_contents(id) on delete set null;

create table if not exists public.institution_assessments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  name text not null,
  description text,
  modality text not null check (
    modality in ('video_analysis', 'rules_exam', 'trivia', 'referee_exam', 'communication', 'var', 'futsal', 'psychology_orientation', 'physical', 'custom')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'open', 'closed', 'cancelled', 'archived')
  ),
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
  minimum_score numeric(5,2) check (minimum_score is null or minimum_score between 0 and 100),
  penalty_value numeric(6,2),
  allow_review boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint institution_assessments_window_check check (
    opens_at is null or closes_at is null or closes_at > opens_at
  ),
  constraint institution_assessments_settings_object_check check (
    jsonb_typeof(settings) = 'object'
  )
);

create table if not exists public.institution_assessment_items (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assessment_id uuid not null references public.institution_assessments(id) on delete cascade,
  item_type text not null check (
    item_type in ('global_clip', 'institutional_clip', 'rule_question', 'institution_content', 'manual')
  ),
  source_id text,
  item_snapshot jsonb not null default '{}'::jsonb,
  points numeric(7,2) not null default 1 check (points >= 0),
  sort_order integer not null default 0,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  constraint institution_assessment_items_snapshot_object_check check (
    jsonb_typeof(item_snapshot) = 'object'
  )
);

create table if not exists public.institution_assessment_assignments (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assessment_id uuid not null references public.institution_assessments(id) on delete cascade,
  group_id uuid references public.institution_groups(id) on delete cascade,
  user_id text,
  assigned_by_user_id text not null,
  assigned_at timestamptz not null default now(),
  opens_at_override timestamptz,
  closes_at_override timestamptz,
  attempts_override integer check (attempts_override is null or attempts_override > 0),
  status text not null default 'assigned' check (
    status in ('assigned', 'cancelled', 'completed')
  ),
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

create unique index if not exists institution_assessment_assignments_group_unique
  on public.institution_assessment_assignments (assessment_id, group_id)
  where group_id is not null and status <> 'cancelled';

create unique index if not exists institution_assessment_assignments_user_unique
  on public.institution_assessment_assignments (assessment_id, user_id)
  where user_id is not null and status <> 'cancelled';

create table if not exists public.institution_assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assessment_id uuid not null references public.institution_assessments(id) on delete cascade,
  assignment_id uuid not null references public.institution_assessment_assignments(id) on delete cascade,
  group_id uuid references public.institution_groups(id) on delete set null,
  user_id text not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'not_started' check (
    status in ('not_started', 'in_progress', 'submitted', 'graded', 'expired', 'cancelled')
  ),
  started_at timestamptz,
  submitted_at timestamptz,
  graded_at timestamptz,
  score numeric(7,2),
  percentage numeric(5,2) check (percentage is null or percentage between 0 and 100),
  passed boolean,
  time_spent_seconds integer check (time_spent_seconds is null or time_spent_seconds >= 0),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_assessment_sessions_unique unique (
    assignment_id,
    user_id,
    attempt_number
  ),
  constraint institution_assessment_sessions_result_object_check check (
    jsonb_typeof(result_payload) = 'object'
  )
);

create table if not exists public.institution_assessment_feedback (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  session_id uuid not null references public.institution_assessment_sessions(id) on delete cascade,
  author_user_id text not null,
  action text not null check (
    action in ('comment', 'approve', 'fail', 'request_retry', 'mark_for_review', 'assign_activity')
  ),
  comment text,
  attachment_url text,
  audio_url text,
  priority text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.institution_assessment_history (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  assessment_id uuid not null references public.institution_assessments(id) on delete cascade,
  actor_user_id text,
  action text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint institution_assessment_history_snapshot_object_check check (
    jsonb_typeof(snapshot) = 'object'
  )
);

create table if not exists public.institution_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'institutional_notice',
  priority text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  channels text[] not null default array['web']::text[],
  scheduled_for timestamptz,
  expires_at timestamptz,
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')
  ),
  deduplication_key text,
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_notification_campaigns_channels_check check (
    cardinality(channels) > 0
    and channels <@ array['web', 'pwa', 'email', 'push']::text[]
  )
);

create unique index if not exists institution_notification_campaigns_dedupe_unique
  on public.institution_notification_campaigns (institution_id, deduplication_key)
  where deduplication_key is not null;

create table if not exists public.institution_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  campaign_id uuid not null references public.institution_notification_campaigns(id) on delete cascade,
  user_id text not null,
  delivery_status text not null default 'pending' check (
    delivery_status in ('pending', 'sent', 'failed', 'read', 'dismissed')
  ),
  sent_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_notification_recipients_unique unique (campaign_id, user_id)
);

create table if not exists public.institution_data_consents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  membership_id uuid not null references public.institution_memberships(id) on delete cascade,
  user_id text not null,
  data_category text not null check (
    data_category in ('availability', 'readiness_summary', 'physical_load', 'physical_detail', 'medical_notes', 'psychology_compliance', 'psychology_detail', 'post_match_review')
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

create table if not exists public.institution_audit_logs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete set null,
  actor_user_id text,
  actor_membership_id uuid references public.institution_memberships(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  ip_hash text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint institution_audit_logs_before_object_check check (
    before_state is null or jsonb_typeof(before_state) = 'object'
  ),
  constraint institution_audit_logs_after_object_check check (
    after_state is null or jsonb_typeof(after_state) = 'object'
  ),
  constraint institution_audit_logs_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create table if not exists public.institution_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id text not null,
  simulated_role_key text not null,
  status text not null default 'active' check (
    status in ('active', 'ended', 'expired')
  ),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint institution_demo_sessions_expiry_check check (expires_at > started_at),
  constraint institution_demo_sessions_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

alter table if exists public.attempts
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists institution_id uuid references public.institutions(id) on delete set null,
  add column if not exists institution_group_id uuid references public.institution_groups(id) on delete set null,
  add column if not exists assessment_session_id uuid references public.institution_assessment_sessions(id) on delete set null;

alter table if exists public.exam_results
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists institution_id uuid references public.institutions(id) on delete set null,
  add column if not exists institution_group_id uuid references public.institution_groups(id) on delete set null,
  add column if not exists assessment_session_id uuid references public.institution_assessment_sessions(id) on delete set null;

alter table if exists public.rules_exam_results
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists institution_id uuid references public.institutions(id) on delete set null,
  add column if not exists institution_group_id uuid references public.institution_groups(id) on delete set null,
  add column if not exists assessment_session_id uuid references public.institution_assessment_sessions(id) on delete set null;

do $$
begin
  if to_regclass('public.attempts') is not null then
    execute 'create index if not exists attempts_institution_sport_created_idx on public.attempts (institution_id, sport_type, created_at desc)';
    execute 'create index if not exists attempts_assessment_session_idx on public.attempts (assessment_session_id)';
  end if;

  if to_regclass('public.exam_results') is not null then
    execute 'create index if not exists exam_results_institution_sport_created_idx on public.exam_results (institution_id, sport_type, created_at desc)';
    execute 'create index if not exists exam_results_assessment_session_idx on public.exam_results (assessment_session_id)';
  end if;

  if to_regclass('public.rules_exam_results') is not null then
    execute 'create index if not exists rules_exam_results_institution_sport_created_idx on public.rules_exam_results (institution_id, sport_type, created_at desc)';
    execute 'create index if not exists rules_exam_results_assessment_session_idx on public.rules_exam_results (assessment_session_id)';
  end if;
end
$$;

create index if not exists institution_memberships_user_status_idx
  on public.institution_memberships (user_id, status, institution_id);

create index if not exists institution_membership_roles_tenant_idx
  on public.institution_membership_roles (institution_id, membership_id);

create index if not exists institution_groups_tenant_sport_status_idx
  on public.institution_groups (institution_id, sport_type, status);

create index if not exists institution_group_memberships_member_idx
  on public.institution_group_memberships (membership_id, status, group_id);

create index if not exists institution_contents_tenant_sport_status_idx
  on public.institution_contents (institution_id, sport_type, status, created_at desc);

create index if not exists institution_assessments_tenant_window_idx
  on public.institution_assessments (institution_id, status, opens_at, closes_at);

create index if not exists institution_assessment_sessions_user_idx
  on public.institution_assessment_sessions (user_id, status, created_at desc);

create index if not exists institution_assessment_sessions_tenant_group_idx
  on public.institution_assessment_sessions (institution_id, group_id, created_at desc);

create index if not exists institution_notification_recipients_user_idx
  on public.institution_notification_recipients (user_id, delivery_status, created_at desc);

create index if not exists institution_audit_logs_tenant_created_idx
  on public.institution_audit_logs (institution_id, created_at desc);

create index if not exists institution_demo_sessions_user_status_idx
  on public.institution_demo_sessions (user_id, status, expires_at desc);

create or replace function public.validate_institution_assessment_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  assessment_row public.institution_assessments%rowtype;
  assignment_row public.institution_assessment_assignments%rowtype;
  effective_opens_at timestamptz;
  effective_closes_at timestamptz;
  effective_attempts integer;
  participant_is_assigned boolean;
begin
  select * into assessment_row
  from public.institution_assessments
  where id = new.assessment_id
    and deleted_at is null;

  if assessment_row.id is null then
    raise exception 'Assessment not found or archived.';
  end if;

  select * into assignment_row
  from public.institution_assessment_assignments
  where id = new.assignment_id
    and assessment_id = new.assessment_id
    and status <> 'cancelled';

  if assignment_row.id is null then
    raise exception 'Assessment assignment is invalid or cancelled.';
  end if;

  if new.institution_id <> assessment_row.institution_id
    or new.institution_id <> assignment_row.institution_id then
    raise exception 'Assessment tenant mismatch.';
  end if;

  if assignment_row.user_id is not null then
    participant_is_assigned := assignment_row.user_id = new.user_id;
  else
    participant_is_assigned := exists (
      select 1
      from public.institution_group_memberships group_membership
      join public.institution_memberships membership
        on membership.id = group_membership.membership_id
      where group_membership.group_id = assignment_row.group_id
        and group_membership.status = 'active'
        and membership.user_id = new.user_id
        and membership.status = 'active'
    );
  end if;

  if not participant_is_assigned then
    raise exception 'User is not assigned to this assessment.';
  end if;

  if new.group_id is distinct from assignment_row.group_id then
    raise exception 'Assessment group mismatch.';
  end if;

  effective_opens_at := coalesce(
    assignment_row.opens_at_override,
    assessment_row.opens_at
  );
  effective_closes_at := coalesce(
    assignment_row.closes_at_override,
    assessment_row.closes_at
  );
  effective_attempts := coalesce(
    assignment_row.attempts_override,
    assessment_row.attempts_allowed
  );

  if new.attempt_number > effective_attempts then
    raise exception 'Assessment attempt limit exceeded.';
  end if;

  if (
    tg_op = 'INSERT'
    and (new.status in ('in_progress', 'submitted') or new.started_at is not null)
  ) or (
    tg_op = 'UPDATE'
    and (
      (new.status in ('in_progress', 'submitted') and old.status is distinct from new.status)
      or old.started_at is distinct from new.started_at
    )
  ) then
    if effective_opens_at is not null and now() < effective_opens_at then
      raise exception 'Assessment is not open yet.';
    end if;

    if effective_closes_at is not null and now() > effective_closes_at then
      raise exception 'Assessment is closed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_institution_assessment_session_write
  on public.institution_assessment_sessions;
create trigger validate_institution_assessment_session_write
before insert or update of
  institution_id,
  assessment_id,
  assignment_id,
  group_id,
  user_id,
  attempt_number,
  status,
  started_at
on public.institution_assessment_sessions
for each row
execute function public.validate_institution_assessment_session();

create or replace function public.validate_institution_tenant_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  related_institution_id uuid;
  secondary_institution_id uuid;
  related_user_id text;
begin
  case tg_table_name
    when 'institution_role_permissions' then
      select institution_id into related_institution_id
      from public.institution_roles
      where id = new.role_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Role permission tenant mismatch.';
      end if;

    when 'institution_membership_roles' then
      select institution_id into related_institution_id
      from public.institution_memberships
      where id = new.membership_id;

      select institution_id into secondary_institution_id
      from public.institution_roles
      where id = new.role_id;

      if related_institution_id is distinct from new.institution_id
        or (
          secondary_institution_id is not null
          and secondary_institution_id is distinct from new.institution_id
        ) then
        raise exception 'Membership role tenant mismatch.';
      end if;

    when 'institution_membership_permission_overrides' then
      select institution_id into related_institution_id
      from public.institution_memberships
      where id = new.membership_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Permission override tenant mismatch.';
      end if;

    when 'institution_program_items' then
      select institution_id into related_institution_id
      from public.institution_programs
      where id = new.program_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Program item tenant mismatch.';
      end if;

    when 'institution_student_progress' then
      if new.program_id is not null then
        select institution_id into related_institution_id
        from public.institution_programs
        where id = new.program_id;

        if related_institution_id is distinct from new.institution_id then
          raise exception 'Student progress program tenant mismatch.';
        end if;
      end if;

      if new.item_id is not null then
        select institution_id into related_institution_id
        from public.institution_program_items
        where id = new.item_id;

        if related_institution_id is distinct from new.institution_id then
          raise exception 'Student progress item tenant mismatch.';
        end if;
      end if;

    when 'institution_cohorts' then
      if new.program_id is not null then
        select institution_id into related_institution_id
        from public.institution_programs
        where id = new.program_id;

        if related_institution_id is distinct from new.institution_id then
          raise exception 'Cohort program tenant mismatch.';
        end if;
      end if;

    when 'institution_groups' then
      if new.cohort_id is not null then
        select institution_id into related_institution_id
        from public.institution_cohorts
        where id = new.cohort_id;

        if related_institution_id is distinct from new.institution_id then
          raise exception 'Group cohort tenant mismatch.';
        end if;
      end if;

      if new.program_id is not null then
        select institution_id into related_institution_id
        from public.institution_programs
        where id = new.program_id;

        if related_institution_id is distinct from new.institution_id then
          raise exception 'Group program tenant mismatch.';
        end if;
      end if;

    when 'institution_group_memberships' then
      select institution_id into related_institution_id
      from public.institution_groups
      where id = new.group_id;

      select institution_id into secondary_institution_id
      from public.institution_memberships
      where id = new.membership_id;

      if related_institution_id is distinct from new.institution_id
        or secondary_institution_id is distinct from new.institution_id then
        raise exception 'Group membership tenant mismatch.';
      end if;

    when 'institution_content_assignments' then
      select institution_id into related_institution_id
      from public.institution_contents
      where id = new.content_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Content assignment tenant mismatch.';
      end if;

      if new.group_id is not null then
        select institution_id into secondary_institution_id
        from public.institution_groups
        where id = new.group_id;

        if secondary_institution_id is distinct from new.institution_id then
          raise exception 'Content assignment group tenant mismatch.';
        end if;
      else
        if not exists (
          select 1
          from public.institution_memberships membership
          where membership.institution_id = new.institution_id
            and membership.user_id = new.user_id
            and membership.status = 'active'
        ) then
          raise exception 'Content assignment user is not an active member.';
        end if;
      end if;

    when 'institution_assessment_items' then
      select institution_id into related_institution_id
      from public.institution_assessments
      where id = new.assessment_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Assessment item tenant mismatch.';
      end if;

    when 'institution_assessment_assignments' then
      select institution_id into related_institution_id
      from public.institution_assessments
      where id = new.assessment_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Assessment assignment tenant mismatch.';
      end if;

      if new.group_id is not null then
        select institution_id into secondary_institution_id
        from public.institution_groups
        where id = new.group_id;

        if secondary_institution_id is distinct from new.institution_id then
          raise exception 'Assessment assignment group tenant mismatch.';
        end if;
      else
        if not exists (
          select 1
          from public.institution_memberships membership
          where membership.institution_id = new.institution_id
            and membership.user_id = new.user_id
            and membership.status = 'active'
        ) then
          raise exception 'Assessment assignment user is not an active member.';
        end if;
      end if;

    when 'institution_assessment_feedback' then
      select institution_id into related_institution_id
      from public.institution_assessment_sessions
      where id = new.session_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Assessment feedback tenant mismatch.';
      end if;

    when 'institution_assessment_history' then
      select institution_id into related_institution_id
      from public.institution_assessments
      where id = new.assessment_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Assessment history tenant mismatch.';
      end if;

    when 'institution_notification_recipients' then
      select institution_id into related_institution_id
      from public.institution_notification_campaigns
      where id = new.campaign_id;

      if related_institution_id is distinct from new.institution_id then
        raise exception 'Notification recipient tenant mismatch.';
      end if;

      if not exists (
        select 1
        from public.institution_memberships membership
        where membership.institution_id = new.institution_id
          and membership.user_id = new.user_id
          and membership.status = 'active'
      ) then
        raise exception 'Notification recipient is not an active member.';
      end if;

    when 'institution_data_consents' then
      select institution_id, user_id
      into related_institution_id, related_user_id
      from public.institution_memberships
      where id = new.membership_id;

      if related_institution_id is distinct from new.institution_id
        or related_user_id is distinct from new.user_id then
        raise exception 'Consent membership mismatch.';
      end if;

    when 'institution_demo_sessions' then
      if not exists (
        select 1
        from public.institution_roles role_row
        where role_row.role_key = new.simulated_role_key
          and (
            role_row.institution_id is null
            or role_row.institution_id = new.institution_id
          )
      ) then
        raise exception 'Demo role is not valid for this institution.';
      end if;
  end case;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'institution_role_permissions',
    'institution_membership_roles',
    'institution_membership_permission_overrides',
    'institution_program_items',
    'institution_student_progress',
    'institution_cohorts',
    'institution_groups',
    'institution_group_memberships',
    'institution_content_assignments',
    'institution_assessment_items',
    'institution_assessment_assignments',
    'institution_assessment_feedback',
    'institution_assessment_history',
    'institution_notification_recipients',
    'institution_data_consents',
    'institution_demo_sessions'
  ]
  loop
    execute format(
      'drop trigger if exists validate_%I_tenant_links on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create trigger validate_%I_tenant_links before insert or update on public.%I for each row execute function public.validate_institution_tenant_links()',
      table_name,
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'institution_permissions',
    'institution_roles',
    'institution_memberships',
    'institution_membership_permission_overrides',
    'institution_cohorts',
    'institution_groups',
    'institution_group_memberships',
    'institution_contents',
    'institution_assessments',
    'institution_assessment_sessions',
    'institution_notification_campaigns',
    'institution_notification_recipients',
    'institution_data_consents'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

create or replace function public.institution_request_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.institution_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles role_row
    where role_row.user_id = public.institution_request_user_id()
      and role_row.role in ('super_admin', 'video_admin')
  );
$$;

create or replace function public.institution_has_active_membership(
  target_institution_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.institution_is_super_admin()
    or exists (
      select 1
      from public.institution_memberships membership
      where membership.institution_id = target_institution_id
        and membership.user_id = public.institution_request_user_id()
        and membership.status = 'active'
    );
$$;

create or replace function public.institution_has_permission(
  target_institution_id uuid,
  target_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  request_user_id text;
  active_membership_id uuid;
  override_value boolean;
begin
  if public.institution_is_super_admin() then
    return true;
  end if;

  request_user_id := public.institution_request_user_id();
  if request_user_id is null then
    return false;
  end if;

  select membership.id
  into active_membership_id
  from public.institution_memberships membership
  where membership.institution_id = target_institution_id
    and membership.user_id = request_user_id
    and membership.status = 'active'
  limit 1;

  if active_membership_id is null then
    return false;
  end if;

  select permission_override.allowed
  into override_value
  from public.institution_membership_permission_overrides permission_override
  join public.institution_permissions permission_row
    on permission_row.id = permission_override.permission_id
  where permission_override.membership_id = active_membership_id
    and permission_row.permission_key = target_permission_key
  limit 1;

  if found then
    return override_value;
  end if;

  return exists (
    select 1
    from public.institution_membership_roles membership_role
    join public.institution_role_permissions role_permission
      on role_permission.role_id = membership_role.role_id
    join public.institution_permissions permission_row
      on permission_row.id = role_permission.permission_id
    where membership_role.membership_id = active_membership_id
      and permission_row.permission_key = target_permission_key
  );
end;
$$;

create or replace function public.institution_can_access_group(
  target_group_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_institution_id uuid;
begin
  select institution_id
  into target_institution_id
  from public.institution_groups
  where id = target_group_id;

  if target_institution_id is null then
    return false;
  end if;

  if public.institution_has_permission(target_institution_id, 'groups.read')
    or public.institution_has_permission(target_institution_id, 'groups.manage') then
    return true;
  end if;

  return exists (
    select 1
    from public.institution_group_memberships group_membership
    join public.institution_memberships membership
      on membership.id = group_membership.membership_id
    where group_membership.group_id = target_group_id
      and group_membership.status = 'active'
      and membership.user_id = public.institution_request_user_id()
      and membership.status = 'active'
  );
end;
$$;

create or replace function public.institution_can_access_content(
  target_content_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  content_row public.institution_contents%rowtype;
begin
  select * into content_row
  from public.institution_contents
  where id = target_content_id
    and deleted_at is null;

  if content_row.id is null then
    return false;
  end if;

  if content_row.author_user_id = public.institution_request_user_id()
    or public.institution_has_permission(content_row.institution_id, 'content.manage') then
    return true;
  end if;

  if content_row.status <> 'published' then
    return false;
  end if;

  if content_row.visibility = 'public' then
    return public.institution_request_user_id() is not null;
  end if;

  if not public.institution_has_permission(content_row.institution_id, 'content.read') then
    return false;
  end if;

  if content_row.visibility = 'institution' then
    return true;
  end if;

  return exists (
    select 1
    from public.institution_content_assignments assignment
    where assignment.content_id = target_content_id
      and (
        assignment.user_id = public.institution_request_user_id()
        or (
          assignment.group_id is not null
          and public.institution_can_access_group(assignment.group_id)
        )
      )
  );
end;
$$;

create or replace function public.institution_can_access_assessment(
  target_assessment_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_institution_id uuid;
begin
  select institution_id
  into target_institution_id
  from public.institution_assessments
  where id = target_assessment_id
    and deleted_at is null;

  if target_institution_id is null then
    return false;
  end if;

  if public.institution_has_permission(target_institution_id, 'assessments.manage')
    or public.institution_has_permission(target_institution_id, 'assessments.grade') then
    return true;
  end if;

  if not public.institution_has_permission(target_institution_id, 'assessments.read') then
    return false;
  end if;

  return exists (
    select 1
    from public.institution_assessment_assignments assignment
    where assignment.assessment_id = target_assessment_id
      and assignment.status <> 'cancelled'
      and (
        assignment.user_id = public.institution_request_user_id()
        or (
          assignment.group_id is not null
          and public.institution_can_access_group(assignment.group_id)
        )
      )
  );
end;
$$;

create or replace function public.institution_is_campaign_recipient(
  target_campaign_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.institution_notification_recipients recipient
    where recipient.campaign_id = target_campaign_id
      and recipient.user_id = public.institution_request_user_id()
  );
$$;

create or replace function public.institution_storage_tenant(
  object_name text
)
returns uuid
language plpgsql
stable
as $$
declare
  folder_parts text[];
begin
  folder_parts := storage.foldername(object_name);
  if cardinality(folder_parts) < 1 then
    return null;
  end if;
  return folder_parts[1]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

revoke all on function public.institution_is_super_admin() from public;
revoke all on function public.institution_has_active_membership(uuid) from public;
revoke all on function public.institution_has_permission(uuid, text) from public;
revoke all on function public.institution_can_access_group(uuid) from public;
revoke all on function public.institution_can_access_content(uuid) from public;
revoke all on function public.institution_can_access_assessment(uuid) from public;
revoke all on function public.institution_is_campaign_recipient(uuid) from public;

grant execute on function public.institution_request_user_id() to authenticated, service_role;
grant execute on function public.institution_is_super_admin() to authenticated, service_role;
grant execute on function public.institution_has_active_membership(uuid) to authenticated, service_role;
grant execute on function public.institution_has_permission(uuid, text) to authenticated, service_role;
grant execute on function public.institution_can_access_group(uuid) to authenticated, service_role;
grant execute on function public.institution_can_access_content(uuid) to authenticated, service_role;
grant execute on function public.institution_can_access_assessment(uuid) to authenticated, service_role;
grant execute on function public.institution_is_campaign_recipient(uuid) to authenticated, service_role;
grant execute on function public.institution_storage_tenant(text) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'institutions',
    'user_roles',
    'institution_members',
    'institution_profiles',
    'institution_programs',
    'institution_program_items',
    'institution_student_progress',
    'institutional_clips',
    'institution_permissions',
    'institution_roles',
    'institution_role_permissions',
    'institution_memberships',
    'institution_membership_roles',
    'institution_membership_permission_overrides',
    'institution_cohorts',
    'institution_groups',
    'institution_group_memberships',
    'institution_contents',
    'institution_content_assignments',
    'institution_assessments',
    'institution_assessment_items',
    'institution_assessment_assignments',
    'institution_assessment_sessions',
    'institution_assessment_feedback',
    'institution_assessment_history',
    'institution_notification_campaigns',
    'institution_notification_recipients',
    'institution_data_consents',
    'institution_audit_logs',
    'institution_demo_sessions'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
    end if;
  end loop;
end
$$;

drop policy if exists institution_permissions_authenticated_read on public.institution_permissions;
create policy institution_permissions_authenticated_read
on public.institution_permissions
for select
to authenticated
using (true);

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own
on public.user_roles
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_is_super_admin()
);

drop policy if exists institutions_member_read on public.institutions;
create policy institutions_member_read
on public.institutions
for select
to authenticated
using (
  deleted_at is null
  and public.institution_has_active_membership(id)
);

drop policy if exists institutions_admin_update on public.institutions;
create policy institutions_admin_update
on public.institutions
for update
to authenticated
using (public.institution_has_permission(id, 'institution.manage'))
with check (public.institution_has_permission(id, 'institution.manage'));

drop policy if exists institution_profiles_member_read on public.institution_profiles;
create policy institution_profiles_member_read
on public.institution_profiles
for select
to authenticated
using (public.institution_has_active_membership(institution_id));

drop policy if exists institution_profiles_admin_manage on public.institution_profiles;
create policy institution_profiles_admin_manage
on public.institution_profiles
for all
to authenticated
using (public.institution_has_permission(institution_id, 'institution.manage'))
with check (public.institution_has_permission(institution_id, 'institution.manage'));

drop policy if exists institution_roles_member_read on public.institution_roles;
create policy institution_roles_member_read
on public.institution_roles
for select
to authenticated
using (
  institution_id is null
  or public.institution_has_permission(institution_id, 'roles.read')
  or public.institution_has_permission(institution_id, 'roles.manage')
);

drop policy if exists institution_roles_admin_manage on public.institution_roles;
create policy institution_roles_admin_manage
on public.institution_roles
for all
to authenticated
using (
  institution_id is not null
  and public.institution_has_permission(institution_id, 'roles.manage')
)
with check (
  institution_id is not null
  and public.institution_has_permission(institution_id, 'roles.manage')
);

drop policy if exists institution_role_permissions_member_read on public.institution_role_permissions;
create policy institution_role_permissions_member_read
on public.institution_role_permissions
for select
to authenticated
using (
  institution_id is null
  or public.institution_has_permission(institution_id, 'roles.read')
  or public.institution_has_permission(institution_id, 'roles.manage')
);

drop policy if exists institution_role_permissions_admin_manage on public.institution_role_permissions;
create policy institution_role_permissions_admin_manage
on public.institution_role_permissions
for all
to authenticated
using (
  institution_id is not null
  and public.institution_has_permission(institution_id, 'roles.manage')
)
with check (
  institution_id is not null
  and public.institution_has_permission(institution_id, 'roles.manage')
);

drop policy if exists institution_memberships_scoped_read on public.institution_memberships;
create policy institution_memberships_scoped_read
on public.institution_memberships
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'members.read')
  or public.institution_has_permission(institution_id, 'members.manage')
);

drop policy if exists institution_memberships_admin_insert on public.institution_memberships;
create policy institution_memberships_admin_insert
on public.institution_memberships
for insert
to authenticated
with check (public.institution_has_permission(institution_id, 'members.manage'));

drop policy if exists institution_memberships_admin_update on public.institution_memberships;
create policy institution_memberships_admin_update
on public.institution_memberships
for update
to authenticated
using (public.institution_has_permission(institution_id, 'members.manage'))
with check (public.institution_has_permission(institution_id, 'members.manage'));

drop policy if exists institution_members_legacy_scoped_read on public.institution_members;
create policy institution_members_legacy_scoped_read
on public.institution_members
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'members.read')
  or public.institution_has_permission(institution_id, 'members.manage')
);

drop policy if exists institution_members_legacy_admin_manage on public.institution_members;
create policy institution_members_legacy_admin_manage
on public.institution_members
for all
to authenticated
using (public.institution_has_permission(institution_id, 'members.manage'))
with check (public.institution_has_permission(institution_id, 'members.manage'));

drop policy if exists institution_membership_roles_scoped_read on public.institution_membership_roles;
create policy institution_membership_roles_scoped_read
on public.institution_membership_roles
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'members.read')
  or public.institution_has_permission(institution_id, 'roles.read')
  or exists (
    select 1
    from public.institution_memberships membership
    where membership.id = membership_id
      and membership.user_id = public.institution_request_user_id()
  )
);

drop policy if exists institution_membership_roles_admin_manage on public.institution_membership_roles;
create policy institution_membership_roles_admin_manage
on public.institution_membership_roles
for all
to authenticated
using (public.institution_has_permission(institution_id, 'members.manage'))
with check (
  public.institution_has_permission(institution_id, 'members.manage')
  and public.institution_has_permission(institution_id, 'roles.manage')
);

drop policy if exists institution_permission_overrides_scoped_read on public.institution_membership_permission_overrides;
create policy institution_permission_overrides_scoped_read
on public.institution_membership_permission_overrides
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'roles.manage')
  or exists (
    select 1
    from public.institution_memberships membership
    where membership.id = membership_id
      and membership.user_id = public.institution_request_user_id()
  )
);

drop policy if exists institution_permission_overrides_admin_manage on public.institution_membership_permission_overrides;
create policy institution_permission_overrides_admin_manage
on public.institution_membership_permission_overrides
for all
to authenticated
using (public.institution_has_permission(institution_id, 'roles.manage'))
with check (public.institution_has_permission(institution_id, 'roles.manage'));

drop policy if exists institution_programs_course_read on public.institution_programs;
create policy institution_programs_course_read
on public.institution_programs
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'courses.read')
  or public.institution_has_permission(institution_id, 'courses.manage')
);

drop policy if exists institution_programs_course_manage on public.institution_programs;
create policy institution_programs_course_manage
on public.institution_programs
for all
to authenticated
using (public.institution_has_permission(institution_id, 'courses.manage'))
with check (public.institution_has_permission(institution_id, 'courses.manage'));

drop policy if exists institution_program_items_course_read on public.institution_program_items;
create policy institution_program_items_course_read
on public.institution_program_items
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'courses.read')
  or public.institution_has_permission(institution_id, 'courses.manage')
);

drop policy if exists institution_program_items_course_manage on public.institution_program_items;
create policy institution_program_items_course_manage
on public.institution_program_items
for all
to authenticated
using (public.institution_has_permission(institution_id, 'courses.manage'))
with check (public.institution_has_permission(institution_id, 'courses.manage'));

drop policy if exists institution_progress_scoped_read on public.institution_student_progress;
create policy institution_progress_scoped_read
on public.institution_student_progress
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'metrics.read_individual')
);

drop policy if exists institution_progress_own_update on public.institution_student_progress;
create policy institution_progress_own_update
on public.institution_student_progress
for update
to authenticated
using (user_id = public.institution_request_user_id())
with check (user_id = public.institution_request_user_id());

drop policy if exists institution_cohorts_scoped_read on public.institution_cohorts;
create policy institution_cohorts_scoped_read
on public.institution_cohorts
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'courses.read')
  or public.institution_has_permission(institution_id, 'groups.read')
);

drop policy if exists institution_cohorts_admin_manage on public.institution_cohorts;
create policy institution_cohorts_admin_manage
on public.institution_cohorts
for all
to authenticated
using (public.institution_has_permission(institution_id, 'courses.manage'))
with check (public.institution_has_permission(institution_id, 'courses.manage'));

drop policy if exists institution_groups_scoped_read on public.institution_groups;
create policy institution_groups_scoped_read
on public.institution_groups
for select
to authenticated
using (public.institution_can_access_group(id));

drop policy if exists institution_groups_admin_manage on public.institution_groups;
create policy institution_groups_admin_manage
on public.institution_groups
for all
to authenticated
using (public.institution_has_permission(institution_id, 'groups.manage'))
with check (public.institution_has_permission(institution_id, 'groups.manage'));

drop policy if exists institution_group_memberships_scoped_read on public.institution_group_memberships;
create policy institution_group_memberships_scoped_read
on public.institution_group_memberships
for select
to authenticated
using (
  public.institution_can_access_group(group_id)
  and (
    public.institution_has_permission(institution_id, 'members.read')
    or exists (
      select 1
      from public.institution_memberships membership
      where membership.id = membership_id
        and membership.user_id = public.institution_request_user_id()
    )
  )
);

drop policy if exists institution_group_memberships_admin_manage on public.institution_group_memberships;
create policy institution_group_memberships_admin_manage
on public.institution_group_memberships
for all
to authenticated
using (public.institution_has_permission(institution_id, 'groups.manage'))
with check (public.institution_has_permission(institution_id, 'groups.manage'));

drop policy if exists institution_contents_scoped_read on public.institution_contents;
create policy institution_contents_scoped_read
on public.institution_contents
for select
to authenticated
using (public.institution_can_access_content(id));

drop policy if exists institution_contents_admin_manage on public.institution_contents;
create policy institution_contents_admin_manage
on public.institution_contents
for all
to authenticated
using (public.institution_has_permission(institution_id, 'content.manage'))
with check (public.institution_has_permission(institution_id, 'content.manage'));

drop policy if exists institution_content_assignments_scoped_read on public.institution_content_assignments;
create policy institution_content_assignments_scoped_read
on public.institution_content_assignments
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or (group_id is not null and public.institution_can_access_group(group_id))
  or public.institution_has_permission(institution_id, 'content.manage')
);

drop policy if exists institution_content_assignments_admin_manage on public.institution_content_assignments;
create policy institution_content_assignments_admin_manage
on public.institution_content_assignments
for all
to authenticated
using (public.institution_has_permission(institution_id, 'content.manage'))
with check (public.institution_has_permission(institution_id, 'content.manage'));

drop policy if exists institutional_clips_scoped_read on public.institutional_clips;
create policy institutional_clips_scoped_read
on public.institutional_clips
for select
to authenticated
using (
  uploaded_by = public.institution_request_user_id()
  or is_public = true
  or (
    institution_id is not null
    and public.institution_has_permission(institution_id, 'content.read')
  )
);

drop policy if exists institutional_clips_scoped_insert on public.institutional_clips;
create policy institutional_clips_scoped_insert
on public.institutional_clips
for insert
to authenticated
with check (
  uploaded_by = public.institution_request_user_id()
  and institution_id is not null
  and public.institution_has_permission(institution_id, 'content.manage')
);

drop policy if exists institutional_clips_scoped_update on public.institutional_clips;
create policy institutional_clips_scoped_update
on public.institutional_clips
for update
to authenticated
using (
  uploaded_by = public.institution_request_user_id()
  and institution_id is not null
  and public.institution_has_permission(institution_id, 'content.manage')
)
with check (
  uploaded_by = public.institution_request_user_id()
  and institution_id is not null
  and public.institution_has_permission(institution_id, 'content.manage')
);

drop policy if exists institution_assessments_scoped_read on public.institution_assessments;
create policy institution_assessments_scoped_read
on public.institution_assessments
for select
to authenticated
using (public.institution_can_access_assessment(id));

drop policy if exists institution_assessments_admin_manage on public.institution_assessments;
create policy institution_assessments_admin_manage
on public.institution_assessments
for all
to authenticated
using (public.institution_has_permission(institution_id, 'assessments.manage'))
with check (public.institution_has_permission(institution_id, 'assessments.manage'));

drop policy if exists institution_assessment_items_scoped_read on public.institution_assessment_items;
create policy institution_assessment_items_scoped_read
on public.institution_assessment_items
for select
to authenticated
using (public.institution_can_access_assessment(assessment_id));

drop policy if exists institution_assessment_items_admin_manage on public.institution_assessment_items;
create policy institution_assessment_items_admin_manage
on public.institution_assessment_items
for all
to authenticated
using (public.institution_has_permission(institution_id, 'assessments.manage'))
with check (public.institution_has_permission(institution_id, 'assessments.manage'));

drop policy if exists institution_assessment_assignments_scoped_read on public.institution_assessment_assignments;
create policy institution_assessment_assignments_scoped_read
on public.institution_assessment_assignments
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or (group_id is not null and public.institution_can_access_group(group_id))
  or public.institution_has_permission(institution_id, 'assessments.manage')
  or public.institution_has_permission(institution_id, 'assessments.grade')
);

drop policy if exists institution_assessment_assignments_admin_manage on public.institution_assessment_assignments;
create policy institution_assessment_assignments_admin_manage
on public.institution_assessment_assignments
for all
to authenticated
using (public.institution_has_permission(institution_id, 'assessments.manage'))
with check (public.institution_has_permission(institution_id, 'assessments.manage'));

drop policy if exists institution_assessment_sessions_scoped_read on public.institution_assessment_sessions;
create policy institution_assessment_sessions_scoped_read
on public.institution_assessment_sessions
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'assessments.grade')
  or public.institution_has_permission(institution_id, 'metrics.read_individual')
);

drop policy if exists institution_assessment_sessions_own_insert on public.institution_assessment_sessions;
create policy institution_assessment_sessions_own_insert
on public.institution_assessment_sessions
for insert
to authenticated
with check (
  user_id = public.institution_request_user_id()
  and public.institution_has_permission(institution_id, 'assessments.take')
  and public.institution_can_access_assessment(assessment_id)
  and status in ('not_started', 'in_progress')
  and score is null
  and percentage is null
  and passed is null
  and graded_at is null
);

drop policy if exists institution_assessment_sessions_own_update on public.institution_assessment_sessions;
create policy institution_assessment_sessions_own_update
on public.institution_assessment_sessions
for update
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'assessments.grade')
)
with check (
  (
    user_id = public.institution_request_user_id()
    and status in ('not_started', 'in_progress', 'submitted', 'expired', 'cancelled')
    and score is null
    and percentage is null
    and passed is null
    and graded_at is null
  )
  or public.institution_has_permission(institution_id, 'assessments.grade')
);

drop policy if exists institution_assessment_feedback_scoped_read on public.institution_assessment_feedback;
create policy institution_assessment_feedback_scoped_read
on public.institution_assessment_feedback
for select
to authenticated
using (
  author_user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'assessments.grade')
  or exists (
    select 1
    from public.institution_assessment_sessions session_row
    where session_row.id = session_id
      and session_row.user_id = public.institution_request_user_id()
  )
);

drop policy if exists institution_assessment_feedback_grader_insert on public.institution_assessment_feedback;
create policy institution_assessment_feedback_grader_insert
on public.institution_assessment_feedback
for insert
to authenticated
with check (
  author_user_id = public.institution_request_user_id()
  and public.institution_has_permission(institution_id, 'assessments.grade')
);

drop policy if exists institution_assessment_history_manager_read on public.institution_assessment_history;
create policy institution_assessment_history_manager_read
on public.institution_assessment_history
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'assessments.manage')
  or public.institution_has_permission(institution_id, 'audit.read')
);

drop policy if exists institution_notification_campaigns_scoped_read on public.institution_notification_campaigns;
create policy institution_notification_campaigns_scoped_read
on public.institution_notification_campaigns
for select
to authenticated
using (
  public.institution_has_permission(institution_id, 'notifications.send')
  or public.institution_is_campaign_recipient(id)
);

drop policy if exists institution_notification_campaigns_admin_manage on public.institution_notification_campaigns;
create policy institution_notification_campaigns_admin_manage
on public.institution_notification_campaigns
for all
to authenticated
using (public.institution_has_permission(institution_id, 'notifications.send'))
with check (public.institution_has_permission(institution_id, 'notifications.send'));

drop policy if exists institution_notification_recipients_scoped_read on public.institution_notification_recipients;
create policy institution_notification_recipients_scoped_read
on public.institution_notification_recipients
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'notifications.send')
);

drop policy if exists institution_notification_recipients_own_update on public.institution_notification_recipients;
create policy institution_notification_recipients_own_update
on public.institution_notification_recipients
for update
to authenticated
using (user_id = public.institution_request_user_id())
with check (user_id = public.institution_request_user_id());

drop policy if exists institution_notification_recipients_admin_manage on public.institution_notification_recipients;
create policy institution_notification_recipients_admin_manage
on public.institution_notification_recipients
for all
to authenticated
using (public.institution_has_permission(institution_id, 'notifications.send'))
with check (public.institution_has_permission(institution_id, 'notifications.send'));

drop policy if exists institution_data_consents_scoped_read on public.institution_data_consents;
create policy institution_data_consents_scoped_read
on public.institution_data_consents
for select
to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_has_permission(institution_id, 'privacy.consents.read')
);

drop policy if exists institution_data_consents_own_manage on public.institution_data_consents;
drop policy if exists institution_data_consents_own_insert on public.institution_data_consents;
create policy institution_data_consents_own_insert
on public.institution_data_consents
for insert
to authenticated
with check (user_id = public.institution_request_user_id());

drop policy if exists institution_data_consents_own_update on public.institution_data_consents;
create policy institution_data_consents_own_update
on public.institution_data_consents
for update
to authenticated
using (user_id = public.institution_request_user_id())
with check (user_id = public.institution_request_user_id());

drop policy if exists institution_audit_logs_authorized_read on public.institution_audit_logs;
create policy institution_audit_logs_authorized_read
on public.institution_audit_logs
for select
to authenticated
using (
  institution_id is not null
  and public.institution_has_permission(institution_id, 'audit.read')
);

drop policy if exists institution_demo_sessions_own_read on public.institution_demo_sessions;
create policy institution_demo_sessions_own_read
on public.institution_demo_sessions
for select
to authenticated
using (user_id = public.institution_request_user_id());

drop policy if exists institution_demo_sessions_authorized_insert on public.institution_demo_sessions;
create policy institution_demo_sessions_authorized_insert
on public.institution_demo_sessions
for insert
to authenticated
with check (
  user_id = public.institution_request_user_id()
  and public.institution_has_permission(institution_id, 'demo.switch')
  and exists (
    select 1
    from public.institutions institution_row
    where institution_row.id = institution_id
      and institution_row.is_demo = true
  )
);

drop policy if exists institution_demo_sessions_own_update on public.institution_demo_sessions;
create policy institution_demo_sessions_own_update
on public.institution_demo_sessions
for update
to authenticated
using (user_id = public.institution_request_user_id())
with check (user_id = public.institution_request_user_id());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'institutional-content',
  'institutional-content',
  false,
  524288000,
  array[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf',
    'audio/mpeg',
    'audio/wav',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists institutional_content_storage_read on storage.objects;
create policy institutional_content_storage_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'institutional-content'
  and public.institution_has_active_membership(
    public.institution_storage_tenant(name)
  )
);

drop policy if exists institutional_content_storage_insert on storage.objects;
create policy institutional_content_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'institutional-content'
  and public.institution_has_permission(
    public.institution_storage_tenant(name),
    'content.manage'
  )
);

drop policy if exists institutional_content_storage_update on storage.objects;
create policy institutional_content_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'institutional-content'
  and public.institution_has_permission(
    public.institution_storage_tenant(name),
    'content.manage'
  )
)
with check (
  bucket_id = 'institutional-content'
  and public.institution_has_permission(
    public.institution_storage_tenant(name),
    'content.manage'
  )
);

drop policy if exists institutional_content_storage_delete on storage.objects;
create policy institutional_content_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'institutional-content'
  and public.institution_has_permission(
    public.institution_storage_tenant(name),
    'content.manage'
  )
);

grant select on public.institution_permissions to authenticated;
grant select, insert, update on public.institutions to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update on public.institution_members to authenticated;
grant select, insert, update on public.institution_profiles to authenticated;
grant select, insert, update, delete on public.institution_programs to authenticated;
grant select, insert, update, delete on public.institution_program_items to authenticated;
grant select, insert, update on public.institution_student_progress to authenticated;
grant select, insert, update on public.institutional_clips to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'institution_roles',
    'institution_role_permissions',
    'institution_memberships',
    'institution_membership_roles',
    'institution_membership_permission_overrides',
    'institution_cohorts',
    'institution_groups',
    'institution_group_memberships',
    'institution_contents',
    'institution_content_assignments',
    'institution_assessments',
    'institution_assessment_items',
    'institution_assessment_assignments',
    'institution_assessment_sessions',
    'institution_assessment_feedback',
    'institution_assessment_history',
    'institution_notification_campaigns',
    'institution_notification_recipients',
    'institution_data_consents',
    'institution_demo_sessions'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end
$$;

grant select on public.institution_audit_logs to authenticated;
grant select, insert on public.institution_audit_logs to service_role;
grant select, insert, update, delete on public.institution_permissions to service_role;
grant select, insert, update, delete on public.institutions to service_role;
grant select, insert, update, delete on public.institution_members to service_role;
grant select, insert, update, delete on public.institution_profiles to service_role;
grant select, insert, update, delete on public.institution_programs to service_role;
grant select, insert, update, delete on public.institution_program_items to service_role;
grant select, insert, update, delete on public.institution_student_progress to service_role;
grant select, insert, update, delete on public.institutional_clips to service_role;

comment on table public.institution_memberships is
  'Canonical multi-institution membership table. institution_members remains temporarily for compatibility.';

comment on table public.institution_assessment_sessions is
  'Assessment lifecycle header. Technical answers remain in existing attempt/result tables.';

comment on table public.institution_data_consents is
  'Explicit sharing consent. Detailed psychology and medical records remain private unless granted.';

notify pgrst, 'reload schema';

commit;
