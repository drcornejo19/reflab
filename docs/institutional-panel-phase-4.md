# Panel institucional - Fase 4

## Alcance implementado

- Directorio institucional de miembros con separacion por `institution_id`.
- Invitacion individual por correo mediante Clerk desde el servidor.
- Importacion CSV asistida, con un maximo de 25 personas por lote.
- Activacion automatica de la membresia cuando una invitacion es aceptada.
- Asignacion de rol, disciplina y categoria.
- Suspension, reactivacion y baja logica sin borrar historial.
- Reenvio de invitaciones pendientes.
- Creacion y cambio de estado de cohortes.
- Creacion y cambio de estado de grupos.
- Asignacion de participantes, instructores, coordinadores y observadores.
- Registro de acciones en `institution_audit_logs`.

## Tablas reutilizadas

- `institution_memberships`
- `institution_membership_roles`
- `institution_roles`
- `institution_role_permissions`
- `institution_cohorts`
- `institution_groups`
- `institution_group_memberships`
- `institution_audit_logs`
- `user_profiles`

No se agregaron tablas ni migraciones en esta fase. El modelo y las politicas RLS
fueron creados por `202607160001_institutional_multitenant_foundation.sql`.

## Seguridad

- Todas las operaciones se ejecutan en Route Handlers del servidor.
- El cliente no recibe `CLERK_SECRET_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`.
- Las lecturas y escrituras requieren permisos institucionales explicitos.
- Una institucion no puede asignar miembros o grupos de otro tenant.
- No se permite activar manualmente una invitacion no aceptada.
- No se permite eliminar el ultimo administrador institucional activo.
- La baja de una membresia es logica mediante el estado `revoked`.

## CSV

Columnas admitidas, separadas por coma o punto y coma:

```text
email,nombre,rol,disciplina,categoria
arbitro@ejemplo.org,Nombre Apellido,referee,football_11,Primera C
```

Las claves de rol validas se obtienen del catalogo institucional. Las disciplinas
admitidas actualmente son `football_11` y `futsal`, siempre que esten habilitadas
para la institucion seleccionada.

## Pendientes de fases posteriores

- La asignacion de contenidos corresponde a la Fase 5.
- La programacion de evaluaciones corresponde a la Fase 6.
- Las notificaciones internas posteriores al alta corresponden a la Fase 9.
- La consulta visual de auditoria corresponde a una fase administrativa posterior.
