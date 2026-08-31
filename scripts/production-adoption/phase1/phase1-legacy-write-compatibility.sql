begin;
set local statement_timeout = '10s';

-- This is the historical official-attempt shape that must remain writable
-- until the canonical exam runtime is cut over.
insert into public.attempts (id, user_id, exam_result_id, submission_id)
values (
  '71000000-0000-4000-8000-000000000001',
  'user_synthetic_001',
  '20000000-0000-4000-8000-000000000001',
  null
);

insert into public.exam_results (
  id, user_id, submission_id, activity_type, source_version, submitted_at
)
values (
  '72000000-0000-4000-8000-000000000001',
  'user_synthetic_001',
  null,
  null,
  null,
  '2026-02-01T00:00:00Z'
);

do $assertions$
begin
  if not exists (
    select 1
    from public.attempts
    where id = '71000000-0000-4000-8000-000000000001'
      and exam_result_id = '20000000-0000-4000-8000-000000000001'
      and source_item_type is null
      and source_item_id is null
      and source_occurrence_id is null
      and institution_assessment_session_id is null
  ) then
    raise exception 'Legacy official attempt shape was rejected or rewritten';
  end if;

  if not exists (
    select 1
    from public.exam_results
    where id = '72000000-0000-4000-8000-000000000001'
      and exam_session_id is null
      and payload_hash is null
  ) then
    raise exception 'Legacy exam-result shape was rejected or rewritten';
  end if;

  if (select pg_catalog.count(*) from public.attempts) <> 38
     or (select pg_catalog.count(*) from public.exam_results) <> 7 then
    raise exception 'Legacy write compatibility counts are invalid';
  end if;
end
$assertions$;

select 'PHASE1_LEGACY_WRITE_COMPATIBILITY_PASS';
rollback;
