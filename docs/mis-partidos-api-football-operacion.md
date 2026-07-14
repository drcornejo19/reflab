# Mis partidos + API-Football

Guia operativa para dejar activa la integracion automatica de fixtures en RefLab sin exponer credenciales.

## 1. Variables requeridas

Agregar en `.env.local`:

```env
SPORTS_API_PROVIDER=api_football
SPORTS_API_BASE_URL=https://v3.football.api-sports.io
SPORTS_API_TOKEN=tu_token_privado
```

Agregar las mismas variables en Vercel para `Production`, `Preview` y `Development`.

## 2. Migracion requerida

Aplicar la migracion nueva:

- `202607130002_fixture_sync_logs.sql`

Si usas Supabase CLI:

```bash
supabase db push
```

Si trabajas desde el panel SQL de Supabase:

1. Abrir SQL Editor.
2. Ejecutar el contenido de `supabase/migrations/202607130002_fixture_sync_logs.sql`.

## 3. Verificacion local

Levantar la app y abrir:

- `/matches`
- `/api/matches/providers`

Verificaciones esperadas:

1. `api_football` debe aparecer como `Listo`.
2. En `Mis partidos`, al elegir futbol 11, Argentina y una competicion con cobertura, debe aparecer un mensaje de sincronizacion automatica o el fallback correspondiente.
3. En futsal debe mantenerse el mensaje de cobertura manual/institucional.

## 4. Prueba sugerida

Usar una combinacion con cobertura real del proveedor:

1. Disciplina: `Futbol 11`
2. Pais: `Argentina`
3. Competicion: una importada desde `API-Football`
4. Fecha: fin de semana objetivo

Resultado esperado:

- Si hay partidos, se guardan en `fixtures` con `data_source = 'api'`.
- Si no hay partidos o no hay cobertura, la pantalla mantiene el fallback manual.

## 5. Endpoints internos disponibles

Todos corren del lado servidor y no exponen token:

- `/api/sports/countries`
- `/api/sports/competitions`
- `/api/sports/fixtures`
- `/api/sports/standings`
- `/api/sports/team-form`
- `/api/matches/catalog`

## 6. Que se sincroniza

La sincronizacion automatica puede guardar o actualizar:

- `countries`
- `associations`
- `competitions`
- `competition_seasons`
- `competition_categories`
- `teams`
- `venues`
- `fixtures`
- `fixture_sync_logs`

## 7. Que no se activo todavia

Todavia no se activo ningun cron.

Pendiente para una siguiente etapa:

- sincronizacion programada viernes a lunes
- snapshots de standings
- snapshots de forma reciente
- activacion institucional de cargas mixtas

## 8. Limitaciones actuales

1. La automatizacion esta validada para `football_11`.
2. `futsal` sigue en modo manual/institucional.
3. `VAR` queda conservadoramente en `false` salvo futura fuente confiable.
4. Si el proveedor responde `429`, RefLab cae a fallback sin romper `Mis partidos`.

## 9. Checklist final

Antes de deploy:

1. Variables cargadas en local y Vercel.
2. Migracion aplicada.
3. `npm run build` correcto.
4. `/api/matches/providers` mostrando `api_football` listo.
5. `Mis partidos` mostrando cobertura automatica o fallback real.
