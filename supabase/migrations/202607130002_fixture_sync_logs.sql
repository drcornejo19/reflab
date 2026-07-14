create table if not exists public.fixture_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  country_name text not null,
  competition_id uuid references public.competitions(id) on delete set null,
  date_from date not null,
  date_to date not null,
  sync_status text not null check (
    sync_status in ('success', 'partial', 'error', 'skipped')
  ),
  message text,
  fixtures_upserted integer not null default 0,
  competitions_upserted integer not null default 0,
  teams_upserted integer not null default 0,
  venues_upserted integer not null default 0,
  error_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixture_sync_logs_error_payload_object_check check (
    jsonb_typeof(error_payload) = 'object'
  )
);

create index if not exists fixture_sync_logs_scope_idx
  on public.fixture_sync_logs (
    provider,
    sport_type,
    country_name,
    competition_id,
    date_from,
    date_to,
    created_at desc
  );

create index if not exists fixture_sync_logs_status_idx
  on public.fixture_sync_logs (sync_status, created_at desc);

drop trigger if exists set_fixture_sync_logs_updated_at on public.fixture_sync_logs;
create trigger set_fixture_sync_logs_updated_at
before update on public.fixture_sync_logs
for each row execute function public.set_updated_at();

alter table public.fixture_sync_logs enable row level security;

drop policy if exists "fixture_sync_logs_service_role_all" on public.fixture_sync_logs;
create policy "fixture_sync_logs_service_role_all"
on public.fixture_sync_logs
for all
to service_role
using (true)
with check (true);

grant select, insert, update, delete on public.fixture_sync_logs to service_role;

notify pgrst, 'reload schema';
