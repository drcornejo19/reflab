# Panel institucional: Fases 5, 6 y 7

## Alcance entregado

### Fase 5: contenidos

- Biblioteca institucional separada del contenido global de RefLab.
- Tipos: video, pregunta, trivia, documento, circular, clase, ejercicio,
  presentacion, PDF, enlace, audio y caso de estudio.
- Estados: borrador, en revision, publicado, archivado y vencido.
- Disciplina, topico, subtopico, regla, dificultad, idioma, vigencia, fuente,
  version y visibilidad.
- Asignacion directa a grupos o usuarios.
- Carga privada a Supabase Storage mediante URL firmada de corta duracion.
- Las preguntas y trivias guardan enunciado, opciones, respuesta y explicacion
  dentro de `metadata`.
- Auditoria de creacion y actualizacion.

### Fase 6: evaluaciones programadas

- Modalidad, disciplina, estado y descripcion.
- Apertura, cierre y zona horaria institucional.
- Duracion, intentos, puntaje minimo, penalizacion, feedback y revision.
- Navegacion libre o secuencial.
- Aleatorizacion configurable de preguntas y videos.
- Seleccion exclusiva de contenidos institucionales publicados y de la misma
  disciplina.
- Asignacion a grupos o usuarios.
- Historial y auditoria de cambios.
- Una evaluacion con intentos existentes no permite cambiar sus actividades.
- Las asignaciones existentes conservan su identificador para no reiniciar el
  contador de intentos.

### Fase 7: alumno y arbitro

- Vista real `Mi Programa`, sin informacion simulada.
- Material visible segun institucion, disciplina, vigencia, visibilidad, grupo
  y asignacion directa.
- Agenda personal con estados disponible, proxima, cerrada, completada o sin
  intentos.
- Inicio de sesion de evaluacion con validacion de apertura, cierre, pertenencia
  e intentos.
- Cronometro, navegacion, respuestas obligatorias y envio final.
- Correccion automatica cuando existe respuesta configurada.
- Resultado pendiente cuando el contenido requiere evaluacion humana.
- Las respuestas correctas solo se exponen despues de finalizar y cuando la
  configuracion permite revision o feedback.

## Rutas de interfaz

- `/institution/contents`
- `/institution/assessments`
- `/institution/learning`
- `/institution/learning/assessments/[sessionId]`

## Rutas API

- `GET|POST /api/institution/contents`
- `PATCH /api/institution/contents/[contentId]`
- `POST /api/institution/contents/upload`
- `GET|POST /api/institution/assessments`
- `PATCH /api/institution/assessments/[assessmentId]`
- `GET /api/institution/learning`
- `POST /api/institution/learning/assessments/[assignmentId]/start`
- `GET|PATCH /api/institution/learning/sessions/[sessionId]`

Todas las respuestas privadas usan `Cache-Control: private, no-store`.

## Permisos

- Gestion de contenidos: `content.manage`.
- Publicacion: `content.publish`.
- Gestion de evaluaciones: `assessments.manage`.
- Lectura personal: `institution.read`, `content.read` y `assessments.read`.
- Inicio y envio de intentos: `assessments.take`.

Las rutas usan Clerk y validacion explicita de permisos antes de operar con el
cliente administrativo de Supabase. Las politicas RLS y triggers de la
migracion institucional siguen siendo la segunda barrera de seguridad.

## Base de datos

No se agregaron migraciones en estas fases. Se reutilizan:

- `institution_contents`
- `institution_content_assignments`
- `institution_assessments`
- `institution_assessment_items`
- `institution_assessment_assignments`
- `institution_assessment_sessions`
- `institution_assessment_history`
- `institution_audit_logs`
- bucket privado `institutional-content`

## Validaciones realizadas

- `npm.cmd run lint`
- `npm.cmd exec tsc -- --noEmit`
- `npm.cmd run build`
- `git diff --check`
- APIs privadas sin sesion: respuesta `401`.
- Paginas institucionales sin sesion: redireccion `307` al acceso.

## Riesgos y pendientes

- Los archivos se cargan directamente a Storage con un token temporal. Si el
  usuario abandona el formulario despues de subir y antes de guardar, puede
  quedar un objeto sin contenido asociado; una limpieza programada de
  huerfanos puede agregarse en una fase operativa posterior.
- Videos externos se abren mediante su URL; solo los archivos privados
  compatibles se reproducen dentro de la evaluacion.
- La correccion humana y el feedback del evaluador usan las tablas existentes,
  pero su panel operativo corresponde a la fase de metricas y seguimiento.
- No se activaron cron jobs, notificaciones, commits, push ni deploy.
