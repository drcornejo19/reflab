# Panel institucional - Fase 2

## Alcance

Esta fase crea la base multi-tenant sin reemplazar datos historicos. Incluye:

- instituciones ampliadas y preparadas para multiples disciplinas;
- membresias multiinstitucion;
- roles, permisos y overrides por membresia;
- cohortes, grupos y participantes;
- contenidos y asignaciones;
- evaluaciones programadas, asignaciones, sesiones y feedback inmutable;
- campanas de notificaciones y destinatarios;
- consentimientos de datos sensibles;
- auditoria y sesiones de demostracion;
- RLS para tablas y Storage;
- vinculos opcionales desde intentos y examenes existentes.

`institution_members` y el campo institucional de `user_roles` se mantienen
temporalmente para no romper las rutas actuales. `institution_memberships` es
la nueva fuente canonica para las siguientes fases.

## Autenticacion Clerk + Supabase

Las politicas usan el `sub` del token de Clerk mediante `auth.jwt()`.

Antes de consumir las tablas directamente desde la aplicacion:

1. Activar la integracion de Supabase en Clerk.
2. Agregar Clerk como proveedor Third-Party Auth en Supabase.
3. Configurar `NEXT_PUBLIC_SUPABASE_URL`.
4. Configurar `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` para el navegador.
5. Mantener `SUPABASE_SECRET_KEY` exclusivamente en servidor.

El nuevo `createSupabaseServerClient()` inyecta el token de Clerk. Las rutas
que continuan usando `service_role` deben aplicar autorizacion institucional
explicita porque esa clave ignora RLS.

## Aplicacion

El repositorio todavia depende de tablas fundacionales creadas fuera de las
migraciones versionadas. Por ese motivo, no ejecutar `supabase db reset` ni
aplicar directamente en produccion hasta capturar y validar ese esquema base.

Revisar primero el estado enlazado y el plan de cambios:

```bash
supabase migration list --linked
supabase db push --dry-run
```

Aplicar despues en un proyecto de staging o una rama de base de datos:

```bash
supabase db push
```

La migracion principal es:

```text
supabase/migrations/202607160001_institutional_multitenant_foundation.sql
```

La migracion realiza backfill desde `institution_members` y `user_roles`, pero
no elimina esas estructuras.

## Validaciones posteriores

Ejecutar consultas con al menos estos usuarios:

- superadmin RefLab;
- administrador de una institucion;
- instructor asignado a un grupo;
- alumno asignado a una evaluacion;
- usuario sin membresia;
- usuario perteneciente a dos instituciones.

Comprobar que:

- un tenant no puede consultar otro tenant;
- el instructor no ve grupos no asignados salvo permiso explicito;
- el alumno no puede calificarse a si mismo;
- una evaluacion no comienza antes de `opens_at` ni despues de `closes_at`;
- `attempt_number` no supera el limite efectivo;
- psicologia y datos fisicos solo comparten lo consentido;
- los objetos de Storage usan la ruta `<institution_id>/<content_id>/...`.

## Rollback

El rollback es destructivo para los datos creados por esta fase. Hacer backup
antes de ejecutarlo:

```text
supabase/rollbacks/202607160001_institutional_multitenant_foundation.rollback.sql
```

El bucket `institutional-content` solo se elimina si esta vacio. Si contiene
archivos, deben exportarse o eliminarse de forma controlada antes del rollback.

## Pendiente para Fase 3

- selector de institucion activa;
- APIs con `requireInstitutionPermission`;
- reemplazo progresivo de `institution_members`;
- panel real de instituciones y membresias;
- control de modo demo en la capa de comandos;
- tipos de Supabase generados desde el esquema remoto validado.
