create extension if not exists pgcrypto;

create table if not exists public.notification_preferences (
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

create table if not exists public.notification_tokens (
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

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_tokens_user_id_idx
  on public.notification_tokens (user_id);

create index if not exists notification_events_user_id_created_at_idx
  on public.notification_events (user_id, created_at desc);

create index if not exists notification_events_type_created_at_idx
  on public.notification_events (type, created_at desc);

alter table public.notification_preferences enable row level security;
alter table public.notification_tokens enable row level security;
alter table public.notification_events enable row level security;

drop policy if exists "Users can read own notification preferences" on public.notification_preferences;
drop policy if exists "Users can write own notification preferences" on public.notification_preferences;
drop policy if exists "Users can read own notification tokens" on public.notification_tokens;
drop policy if exists "Users can write own notification tokens" on public.notification_tokens;
drop policy if exists "Users can read own notification events" on public.notification_events;
drop policy if exists "Service role manages notification preferences" on public.notification_preferences;
drop policy if exists "Service role manages notification tokens" on public.notification_tokens;
drop policy if exists "Service role manages notification events" on public.notification_events;

create policy "Users can read own notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

create policy "Users can write own notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text))
  with check (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

create policy "Users can read own notification tokens"
  on public.notification_tokens
  for select
  to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

create policy "Users can write own notification tokens"
  on public.notification_tokens
  for all
  to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text))
  with check (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

create policy "Users can read own notification events"
  on public.notification_events
  for select
  to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

create policy "Service role manages notification preferences"
  on public.notification_preferences
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manages notification tokens"
  on public.notification_tokens
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manages notification events"
  on public.notification_events
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update on public.notification_tokens to authenticated;
grant select on public.notification_events to authenticated;
grant all on public.notification_preferences to service_role;
grant all on public.notification_tokens to service_role;
grant all on public.notification_events to service_role;

comment on table public.notification_events is
  'Historial de notificaciones inteligentes enviadas, omitidas o fallidas.';
