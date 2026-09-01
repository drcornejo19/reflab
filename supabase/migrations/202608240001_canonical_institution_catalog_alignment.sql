begin;

insert into public.institution_permissions (
  permission_key,
  name,
  permission_scope,
  is_sensitive
)
values
  ('matches.read', 'Read match appointments', 'matches', false),
  ('matches.manage', 'Manage match appointments', 'matches', true),
  ('demo.switch', 'Switch demo role', 'demo', true)
on conflict (permission_key) do update set
  name = excluded.name,
  permission_scope = excluded.permission_scope,
  is_sensitive = excluded.is_sensitive,
  updated_at = pg_catalog.now();

insert into public.institution_roles (
  institution_id,
  role_key,
  name,
  description,
  is_system,
  is_assignable
)
values
  (null, 'technical_coordinator', 'Coordinador tecnico', 'Coordina grupos, evaluaciones, metricas y designaciones.', true, true),
  (null, 'evaluator', 'Evaluador', 'Corrige y analiza evaluaciones asignadas.', true, true),
  (null, 'content_manager', 'Responsable de contenidos', 'Gestiona contenidos y publicaciones.', true, true),
  (null, 'student', 'Alumno', 'Accede a su actividad institucional asignada.', true, true),
  (null, 'invited_referee', 'Arbitro invitado', 'Acceso temporal a actividades asignadas.', true, true),
  (null, 'observer', 'Observador', 'Consulta informacion institucional permitida.', true, true),
  (null, 'read_only', 'Solo lectura', 'Acceso institucional sin operaciones de escritura.', true, true)
on conflict (role_key) where institution_id is null do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  is_assignable = excluded.is_assignable,
  updated_at = pg_catalog.now();

delete from public.institution_role_permissions role_permission
using public.institution_roles role, public.institution_permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.institution_id is null
  and role.role_key = 'instructor'
  and permission.permission_key in (
    'roles.read',
    'metrics.read_aggregate',
    'reports.read'
  );

with desired_roles(role_key, permission_keys) as (
  values
    (
      'institution_admin',
      array[
        'institution.read', 'institution.manage',
        'members.read', 'members.manage', 'members.invite',
        'roles.read', 'roles.manage',
        'groups.read', 'groups.manage',
        'content.read', 'content.manage', 'content.publish',
        'assessments.read', 'assessments.take', 'assessments.manage', 'assessments.grade',
        'metrics.read_own', 'metrics.read_individual', 'metrics.read_aggregate',
        'reports.read', 'reports.export',
        'notifications.read', 'notifications.send',
        'matches.read', 'matches.manage',
        'audit.read', 'demo.switch'
      ]::text[]
    ),
    (
      'technical_coordinator',
      array[
        'institution.read', 'members.read',
        'groups.read', 'groups.manage',
        'content.read', 'content.manage',
        'assessments.read', 'assessments.manage', 'assessments.grade',
        'metrics.read_individual', 'metrics.read_aggregate',
        'reports.read', 'notifications.read', 'notifications.send',
        'matches.read', 'matches.manage'
      ]::text[]
    ),
    (
      'instructor',
      array[
        'institution.read', 'members.read', 'groups.read',
        'content.read', 'content.manage',
        'assessments.read', 'assessments.manage', 'assessments.grade',
        'metrics.read_individual', 'notifications.read'
      ]::text[]
    ),
    (
      'evaluator',
      array[
        'institution.read', 'groups.read', 'assessments.read',
        'assessments.grade', 'metrics.read_individual'
      ]::text[]
    ),
    (
      'content_manager',
      array[
        'institution.read', 'content.read', 'content.manage', 'content.publish'
      ]::text[]
    ),
    (
      'student',
      array[
        'institution.read', 'content.read', 'assessments.read',
        'assessments.take', 'metrics.read_own', 'notifications.read'
      ]::text[]
    ),
    (
      'referee',
      array[
        'institution.read', 'content.read', 'assessments.read',
        'assessments.take', 'metrics.read_own', 'notifications.read',
        'matches.read'
      ]::text[]
    ),
    (
      'invited_referee',
      array[
        'institution.read', 'content.read', 'assessments.read', 'assessments.take'
      ]::text[]
    ),
    (
      'observer',
      array[
        'institution.read', 'groups.read', 'metrics.read_aggregate', 'reports.read'
      ]::text[]
    ),
    (
      'read_only',
      array[
        'institution.read', 'content.read', 'assessments.read', 'notifications.read'
      ]::text[]
    )
),
desired_role_permissions as (
  select desired_role.role_key, permission_key
  from desired_roles desired_role
  cross join lateral pg_catalog.unnest(desired_role.permission_keys) permission_key
)
insert into public.institution_role_permissions (
  institution_id,
  role_id,
  permission_id
)
select
  null,
  role.id,
  permission.id
from desired_role_permissions desired
join public.institution_roles role
  on role.institution_id is null
 and role.role_key = desired.role_key
join public.institution_permissions permission
  on permission.permission_key = desired.permission_key
on conflict (role_id, permission_id) do nothing;

do $catalog_alignment$
declare
  permission_count integer;
  system_role_count integer;
  system_relation_count integer;
begin
  select pg_catalog.count(*)
  into permission_count
  from public.institution_permissions;

  select pg_catalog.count(*)
  into system_role_count
  from public.institution_roles
  where institution_id is null;

  select pg_catalog.count(*)
  into system_relation_count
  from public.institution_role_permissions role_permission
  join public.institution_roles role on role.id = role_permission.role_id
  where role.institution_id is null;

  if permission_count <> 27
     or system_role_count <> 10
     or system_relation_count <> 87 then
    raise exception using
      errcode = '23514',
      message = pg_catalog.format(
        'Canonical institution catalog mismatch: permissions=%s roles=%s relations=%s',
        permission_count,
        system_role_count,
        system_relation_count
      );
  end if;
end
$catalog_alignment$;

commit;
