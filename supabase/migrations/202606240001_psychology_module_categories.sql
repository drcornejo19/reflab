alter table public.psychology_checkins
  add column if not exists module_slug text;

alter table public.psychology_wellbeing_assessments
  add column if not exists module_slug text;

alter table public.psychology_exercise_sessions
  add column if not exists module_slug text;

update public.psychology_checkins
set module_slug = case
  when checkin_type = 'error_recovery' then 'gestion-error'
  when checkin_type = 'post_match' then 'evaluacion-post-partido'
  else 'preparacion-mental-pre-partido'
end
where module_slug is null;

update public.psychology_wellbeing_assessments
set module_slug = 'resiliencia'
where module_slug is null;

update public.psychology_exercise_sessions
set module_slug = case
  when exercise_type = 'pressure_scenario' then 'presion-competitiva'
  when exercise_type = 'self_talk' then 'confianza-arbitral'
  when exercise_type = 'team_prebrief' then 'preparacion-mental-pre-partido'
  else 'concentracion-foco'
end
where module_slug is null;

create index if not exists psychology_checkins_user_module_created_idx
  on public.psychology_checkins (user_id, module_slug, created_at desc);

create index if not exists psychology_wellbeing_user_module_created_idx
  on public.psychology_wellbeing_assessments (user_id, module_slug, created_at desc);

create index if not exists psychology_exercises_user_module_created_idx
  on public.psychology_exercise_sessions (user_id, module_slug, created_at desc);

-- Metadata preparada para organizar Psicologia Arbitral por modulitos sin perder historial.
