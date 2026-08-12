# Fase 1: acceso, roles, planes y RLS

## Objetivo

Separar identidad, autorización y producto contratado sin perder compatibilidad
con los usuarios existentes.

## Fuentes canónicas

| Concepto | Fuente canónica | Compatibilidad temporal |
| --- | --- | --- |
| Rol global | `user_global_roles` | `user_roles.role` |
| Rol institucional | `institution_memberships` + `institution_membership_roles` | `institution_members` |
| Suscripción individual | `user_subscriptions` | `user_profiles.subscription_plan` y `user_roles.subscription_plan` |
| Licencia institucional | `institution_subscriptions` | `institutions.plan_key` |
| Capacidades | `capabilities` + `plan_capabilities` | Condiciones antiguas `isPro` |
| Excepciones | `capability_overrides` | No aplica |
| Auditoría de acceso | `access_change_audit` | `institution_audit_logs` para recuperación |

`free` continúa siendo aceptado en las columnas legacy, pero se presenta como
`Basic`. Las nuevas decisiones de autorización nunca deben depender de ese
valor legacy.

## Orden de resolución

1. `super_admin` recibe todas las capacidades activas.
2. Una membresía activa en una institución activa con licencia Academy o
   Enterprise hereda capacidades individuales equivalentes a Pro.
3. Se aplican las capacidades de la suscripción individual Basic o Pro.
4. Basic funciona como acceso mínimo.
5. Las excepciones globales pueden permitir o denegar capacidades.
6. Una denegación institucional elimina solamente la fuente de esa institución.

La licencia institucional no convierte permanentemente la suscripción
individual en Pro.

## Autenticación Supabase

El navegador crea un cliente Supabase con el token de sesión de Clerk mediante
`SupabaseProvider`. La clave pública identifica el proyecto, pero las políticas
RLS determinan qué filas puede leer o escribir el usuario.

`SUPABASE_SECRET_KEY` se importa únicamente desde módulos con
`server-only`. Nunca debe usar el prefijo `NEXT_PUBLIC_`.

## Super Admin

La autorización normal consulta `user_global_roles` por el Clerk User ID.

La recuperación por email está aislada y desactivada por defecto:

```env
REFLAB_SUPER_ADMIN_RECOVERY_ENABLED=false
REFLAB_SUPER_ADMIN_RECOVERY_EMAILS=
```

Cada uso del mecanismo de recuperación se registra en
`institution_audit_logs`. No se devuelve el email configurado al navegador.

## Migraciones

`202607240001_access_control_foundation.sql` crea el modelo aditivo, realiza el
backfill y mantiene sincronizadas las columnas legacy desde las RPC
administrativas.

`202607240002_core_rls_lockdown.sql` cierra lectura anónima y limita perfiles,
roles, intentos y resultados al propietario o al Super Admin. También mueve
`institution_is_super_admin()` a la fuente canónica.

La segunda migración debe ejecutarse solamente después de desplegar el cliente
Supabase autenticado o en la misma ventana de mantenimiento.

## Verificación

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:security
```

`test:security` usa exclusivamente la clave pública y falla si el rol `anon`
puede obtener una fila sensible.

## Rollback

El rollback de la segunda migración está en:

`supabase/rollbacks/202607240002_core_rls_lockdown.rollback.sql`

No vuelve a abrir datos a `anon`; solo restaura temporalmente lecturas amplias
para usuarios autenticados. La Migración 1 no debe revertirse eliminando tablas,
porque ya contiene el historial canónico de planes y roles. Si fuera necesario,
el código puede volver a leer las columnas legacy mientras se investiga.
