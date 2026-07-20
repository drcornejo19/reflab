begin;

create table if not exists public.coach_rate_limit_buckets (
  user_id text not null,
  feature text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

create table if not exists public.coach_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  institution_id uuid references public.institutions(id) on delete set null,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  feature text not null check (
    feature in (
      'technical_feedback',
      'exam_analysis',
      'communication_feedback',
      'var_feedback',
      'coach_conversation'
    )
  ),
  prompt_version text not null,
  model_provider text not null,
  model_name text not null,
  status text not null default 'running' check (
    status in ('running', 'completed', 'failed')
  ),
  input_digest text not null,
  output_digest text,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  confidence_label text not null check (
    confidence_label in ('high', 'medium', 'human_review')
  ),
  confidence_score integer not null check (
    confidence_score between 0 and 100
  ),
  requires_human_review boolean not null default false,
  provider_response_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists coach_runs_user_created_idx
  on public.coach_runs (user_id, created_at desc);

create index if not exists coach_runs_sport_feature_created_idx
  on public.coach_runs (sport_type, feature, created_at desc);

create index if not exists coach_runs_institution_created_idx
  on public.coach_runs (institution_id, created_at desc)
  where institution_id is not null;

create table if not exists public.coach_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.coach_runs(id) on delete cascade,
  evidence_type text not null check (
    evidence_type in (
      'clip',
      'attempt',
      'exam',
      'official_document',
      'metric_snapshot'
    )
  ),
  source_table text not null,
  source_id text not null,
  title text not null,
  authority text,
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  rule_reference text,
  source_version text,
  official_url text,
  is_official boolean not null default false,
  normative_status text,
  reviewed_at timestamptz,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint coach_evidence_snapshot_object_check check (
    jsonb_typeof(evidence_snapshot) = 'object'
  )
);

create index if not exists coach_evidence_run_idx
  on public.coach_evidence (run_id, created_at);

create index if not exists coach_evidence_source_idx
  on public.coach_evidence (source_table, source_id);

create table if not exists public.coach_data_consents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  data_category text not null check (
    data_category in (
      'technical_history',
      'match_operational',
      'physical_summary',
      'psychology_summary',
      'psychology_detail',
      'medical_sensitive'
    )
  ),
  purpose text not null check (
    purpose in ('personal_coaching', 'institutional_sharing', 'model_improvement')
  ),
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_data_consents_user_category_purpose_unique
    unique (user_id, data_category, purpose),
  constraint coach_data_consents_dates_check check (
    (granted and granted_at is not null and revoked_at is null)
    or (not granted)
  )
);

create index if not exists coach_data_consents_user_idx
  on public.coach_data_consents (user_id, purpose, data_category);

create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.coach_runs(id) on delete cascade,
  user_id text not null,
  feature text not null,
  model_provider text not null,
  model_name text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) check (
    estimated_cost_usd is null or estimated_cost_usd >= 0
  ),
  created_at timestamptz not null default now(),
  constraint ai_usage_ledger_run_unique unique (run_id)
);

create index if not exists ai_usage_ledger_user_created_idx
  on public.ai_usage_ledger (user_id, created_at desc);

create index if not exists ai_usage_ledger_model_created_idx
  on public.ai_usage_ledger (model_provider, model_name, created_at desc);

create or replace function public.set_coach_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_data_consents_set_updated_at
  on public.coach_data_consents;

create trigger coach_data_consents_set_updated_at
before update on public.coach_data_consents
for each row execute function public.set_coach_updated_at();

create or replace function public.consume_coach_rate_limit(
  p_user_id text,
  p_feature text,
  p_request_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_bucket public.coach_rate_limit_buckets%rowtype;
  v_retry_after integer;
begin
  if nullif(trim(p_user_id), '') is null then
    raise exception 'user_id is required';
  end if;
  if nullif(trim(p_feature), '') is null then
    raise exception 'feature is required';
  end if;
  if p_request_limit < 1 or p_window_seconds < 1 then
    raise exception 'rate limit values must be positive';
  end if;

  insert into public.coach_rate_limit_buckets (
    user_id,
    feature,
    window_started_at,
    request_count,
    updated_at
  )
  values (p_user_id, p_feature, v_now, 0, v_now)
  on conflict (user_id, feature) do nothing;

  select *
    into v_bucket
    from public.coach_rate_limit_buckets
   where user_id = p_user_id
     and feature = p_feature
   for update;

  if v_bucket.window_started_at <=
    v_now - make_interval(secs => p_window_seconds) then
    update public.coach_rate_limit_buckets
       set window_started_at = v_now,
           request_count = 1,
           updated_at = v_now
     where user_id = p_user_id
       and feature = p_feature;

    return query
      select true, greatest(p_request_limit - 1, 0), p_window_seconds;
    return;
  end if;

  v_retry_after := greatest(
    1,
    ceil(
      extract(
        epoch from (
          v_bucket.window_started_at
          + make_interval(secs => p_window_seconds)
          - v_now
        )
      )
    )::integer
  );

  if v_bucket.request_count >= p_request_limit then
    return query select false, 0, v_retry_after;
    return;
  end if;

  update public.coach_rate_limit_buckets
     set request_count = request_count + 1,
         updated_at = v_now
   where user_id = p_user_id
     and feature = p_feature;

  return query
    select
      true,
      greatest(p_request_limit - v_bucket.request_count - 1, 0),
      v_retry_after;
end;
$$;

alter table public.coach_rate_limit_buckets enable row level security;
alter table public.coach_runs enable row level security;
alter table public.coach_evidence enable row level security;
alter table public.coach_data_consents enable row level security;
alter table public.ai_usage_ledger enable row level security;

revoke all on public.coach_rate_limit_buckets from anon, authenticated;
revoke all on public.coach_runs from anon, authenticated;
revoke all on public.coach_evidence from anon, authenticated;
revoke all on public.coach_data_consents from anon, authenticated;
revoke all on public.ai_usage_ledger from anon, authenticated;
revoke all on function public.consume_coach_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;

grant select, insert, update, delete
  on public.coach_rate_limit_buckets to service_role;
grant select, insert, update, delete
  on public.coach_runs to service_role;
grant select, insert, update, delete
  on public.coach_evidence to service_role;
grant select, insert, update, delete
  on public.coach_data_consents to service_role;
grant select, insert, update, delete
  on public.ai_usage_ledger to service_role;
grant execute
  on function public.consume_coach_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.coach_runs is
  'Immutable operational ledger for RefLab Coach executions. Raw prompts and raw outputs are not stored.';

comment on table public.coach_evidence is
  'Evidence snapshots used by each Coach run so every recommendation can be traced and reviewed.';

comment on table public.coach_data_consents is
  'Explicit consent matrix for sensitive data categories used by RefLab Coach or shared institutionally.';

comment on table public.ai_usage_ledger is
  'Token usage ledger. Cost remains null until a versioned pricing catalog is approved.';

notify pgrst, 'reload schema';

commit;
