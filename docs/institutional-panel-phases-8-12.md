# Panel institucional: fases 8 a 12

## Alcance implementado

### Fase 8 - Metricas

- Motor institucional unico en `lib/institutional/metrics-server.ts`.
- Filtros obligatorios por institucion, disciplina y periodo.
- Alcance por permisos:
  - administradores y coordinadores: metricas agregadas;
  - instructores y evaluadores: solo grupos asignados;
  - alumnos y arbitros: solo metricas propias.
- Promedio, sesiones, decisiones corregidas, usuarios activos, cumplimiento,
  aprobacion, tiempo medio, consistencia, topicos, criterios, evolucion y
  comparativa de grupos.
- Fortalezas, puntos criticos y recomendaciones solo con evidencia real.
- Los criterios tecnicos, disciplinarios y de reanudacion muestran `Sin datos`
  cuando los contenidos no contienen una etiqueta de criterio calculable.
- No se consultan ni exponen datos psicologicos, medicos o fisicos.

### Fase 9 - Notificaciones

- Campanas por institucion, grupo o usuario.
- Canales internos `web` y `pwa`.
- Prioridad, programacion, expiracion y confirmacion de lectura.
- Clave de deduplicacion por institucion, contenido, audiencia y horario.
- Los canales `email` y `push` quedan soportados por el modelo, pero no se
  despachan hasta aprobar y configurar un proveedor.
- Todas las altas y lecturas quedan dentro del tenant activo.

### Fase 10 - Reportes

- Vista web basada en el mismo motor de metricas.
- Exportacion CSV UTF-8 con institucion, disciplina, periodo, muestra,
  metricas, grupos y advertencias.
- Vista de impresion limpia para guardar como PDF desde el navegador.
- No se exportan notas psicologicas, medicas ni campos sensibles.
- La exportacion requiere `reports.export`.

### Fase 11 - Modo demo

- Sesiones demo con rol simulado, vencimiento de dos horas y auditoria.
- Roles disponibles: alumno, arbitro, instructor, coordinador y administrador.
- Solo puede iniciarse en instituciones con `is_demo = true`.
- Banner persistente mientras la simulacion esta activa.
- La interfaz usa permisos efectivos del rol simulado.
- Las autorizaciones reales no se reemplazan ni amplian.
- Todas las escrituras institucionales se rechazan en servidor durante la
  sesion demo.

### Fase 12 - QA

- Lint: aprobado.
- TypeScript: aprobado.
- Build de produccion: aprobado.
- APIs nuevas sin sesion: `401`.
- Paginas nuevas sin sesion: redireccion segura al login.
- Separacion de Futbol 11 y Futsal: aplicada en la consulta de evaluaciones.
- Aislamiento multi-tenant: todas las consultas incluyen `institution_id`.
- No se agregaron migraciones en estas fases: se reutilizan las tablas y RLS
  creadas en `202607160001_institutional_multitenant_foundation.sql`.

## Rutas nuevas

- `/institution/metrics`
- `/institution/notifications`
- `/institution/reports`
- `/institution/demo`
- `/api/institution/metrics`
- `/api/institution/notifications`
- `/api/institution/notifications/[recipientId]`
- `/api/institution/reports`
- `/api/institution/reports/export`
- `/api/institution/demo`

## Tablas reutilizadas

- `institution_assessments`
- `institution_assessment_items`
- `institution_assessment_assignments`
- `institution_assessment_sessions`
- `institution_memberships`
- `institution_groups`
- `institution_group_memberships`
- `institution_notification_campaigns`
- `institution_notification_recipients`
- `institution_demo_sessions`
- `institution_audit_logs`

## Pendientes de validacion manual

- Recorrido autenticado con usuarios reales de cada rol.
- Capturas desktop y mobile con una institucion que tenga datos.
- Activacion de una institucion demo mediante `is_demo = true`.
- Prueba de RLS con el cliente autenticado de Supabase en un entorno de QA.
- Despachadores externos de correo y push, sujetos a aprobacion.

## Deploy, cuando sea aprobado

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
git status
git diff --stat
```

Luego se debe revisar el diff, crear el commit aprobado y permitir que Vercel
despliegue la rama vinculada. No se requieren variables de entorno nuevas para
estas fases.
