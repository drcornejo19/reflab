-- Production adoption policy: historical attempts.created_at wall-clock values
-- are interpreted as UTC. This is an approved adoption decision, not proven
-- historical timezone provenance.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog, public;

do $preflight$
declare
  created_at_default text;
  leaderboard_definition_hash text;
begin
  if current_user <> 'postgres'
     or session_user <> 'postgres'
     or pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'Pre-Phase2B adoption installer/session contract mismatch'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('public.attempts') is null
     or pg_catalog.to_regclass('public.exam_results') is null
     or pg_catalog.to_regclass('public.notification_events') is null
     or pg_catalog.to_regclass('public.clips') is null
     or pg_catalog.to_regclass('public.leaderboard') is null then
    raise exception 'Pre-Phase2B adoption dependency is missing'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(array['attempts', 'exam_results', 'notification_events', 'clips', 'leaderboard']) relation_name
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation
      on relation.relnamespace = namespace.oid and relation.relname = relation_name
    left join pg_catalog.pg_roles owner_role on owner_role.oid = relation.relowner
    where relation.oid is null or owner_role.rolname <> 'postgres'
  ) then
    raise exception 'Pre-Phase2B adoption dependency ownership mismatch'
      using errcode = '55000';
  end if;

  select pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false)
  into created_at_default
  from pg_catalog.pg_attribute attribute
  left join pg_catalog.pg_attrdef default_record
    on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
  where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
    and attribute.attname = 'created_at'
    and attribute.attnum > 0 and not attribute.attisdropped;

  if not exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'created_at'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp without time zone'
      and not attribute.attnotnull
      and attribute.attnum > 0 and not attribute.attisdropped
  ) or created_at_default <> 'now()' then
    raise exception 'Historical attempts.created_at contract mismatch'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute attribute
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'score'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'integer'
      and not attribute.attnotnull
      and default_record.oid is null
      and attribute.attnum > 0 and not attribute.attisdropped
  ) then
    raise exception 'Historical attempts.score contract mismatch'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.clips'::pg_catalog.regclass
      and attribute.attname = 'status'
      and attribute.attnum > 0 and not attribute.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where attribute.attrelid = 'public.clips'::pg_catalog.regclass
      and attribute.attname = 'is_active'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'boolean'
      and attribute.attnotnull
      and pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) = 'true'
      and attribute.attnum > 0 and not attribute.attisdropped
  ) then
    raise exception 'Historical clips contract mismatch'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from public.attempts) <> 37
     or (select pg_catalog.count(*) from public.exam_results) <> 6
     or (select pg_catalog.count(*) from public.notification_events) <> 60
     or (select pg_catalog.count(*) from public.attempts where created_at is null) <> 0
     or (select pg_catalog.count(*) from public.attempts
         where score is not null and (score < -99999 or score > 99999)) <> 0
     or (select pg_catalog.count(*) from public.attempts where score is not null) <> 36
     or (select pg_catalog.count(*) from public.attempts where score is null) <> 1
     or (select pg_catalog.min(score) from public.attempts) <> 25
     or (select pg_catalog.max(score) from public.attempts) <> 100
     or (select pg_catalog.count(*) from public.clips) <> 30
     or (select pg_catalog.count(*) from public.clips where is_active) <> 30
     or (select pg_catalog.count(*) from public.clips where not is_active or is_active is null) <> 0
     or (select pg_catalog.count(*) from public.exam_results result
         left join public.referee_exam_sessions session on session.id = result.exam_session_id
         where session.id is null) <> 6
     or (select pg_catalog.count(*) from public.attempts attempt
         where attempt.exam_result_id is null
           and nullif(attempt.criterion_result->>'scoring_version', '') is null) <> 37 then
    raise exception 'Pre-Phase2B adoption aggregate contract mismatch'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or pg_catalog.to_regrole('reflab_preflight_audit_owner') is null
     or (select pg_catalog.count(*) from pg_catalog.pg_policies
         where policyname = 'reflab_preflight_audit_owner_read') <> 58
     or (select pg_catalog.count(*) from information_schema.column_privileges
         where grantee = 'reflab_preflight_audit_owner'
           and privilege_type = 'SELECT') <> 100 then
    raise exception 'Phase 2A semantic sidecar is not exact'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is null
     or pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.admin_set_canonical_global_role(text,text,text,text)') is null
     or pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is not null
     or pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is not null
     or exists (select 1 from pg_catalog.pg_attribute
       where attrelid = 'public.attempts'::pg_catalog.regclass
         and attname = 'canonical_payload_hash' and attnum > 0 and not attisdropped)
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
     or exists (select 1 from reflab_meta.production_adoption_state where phase_order >= 4) then
    raise exception 'Pre-Phase2B provider or adoption state mismatch'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'leaderboard'
      and relation.relkind = 'v' and relation.relpersistence = 'p'
      and relation.reloptions is null
      and pg_catalog.obj_description(relation.oid, 'pg_class') is null
  ) then
    raise exception 'Leaderboard relation/options contract mismatch'
      using errcode = '55000';
  end if;

  select pg_catalog.encode(
    extensions.digest(pg_catalog.pg_get_viewdef('public.leaderboard'::pg_catalog.regclass, true), 'sha256'),
    'hex'
  ) into leaderboard_definition_hash;
  if leaderboard_definition_hash <> 'f422129265876fb2ebecba5b977562893e6451c7278026c9a71cf1864804f623' then
    raise exception 'Leaderboard definition fingerprint mismatch'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.pg_attribute attribute
      where attribute.attrelid = 'public.leaderboard'::pg_catalog.regclass
        and attribute.attnum > 0 and not attribute.attisdropped) <> 5
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'user_id' and attnum = 1 and pg_catalog.format_type(atttypid, atttypmod) = 'text')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'attempts' and attnum = 2 and pg_catalog.format_type(atttypid, atttypmod) = 'bigint')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'avg_score' and attnum = 3 and pg_catalog.format_type(atttypid, atttypmod) = 'numeric')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'best_score' and attnum = 4 and pg_catalog.format_type(atttypid, atttypmod) = 'integer')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'var_yes' and attnum = 5 and pg_catalog.format_type(atttypid, atttypmod) = 'bigint') then
    raise exception 'Leaderboard pre-conversion column fingerprint mismatch'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.aclexplode(
      coalesce((select relacl from pg_catalog.pg_class where oid = 'public.leaderboard'::pg_catalog.regclass),
        pg_catalog.acldefault('r', (select relowner from pg_catalog.pg_class where oid = 'public.leaderboard'::pg_catalog.regclass))))) <> 9
     or exists (
       select 1
       from pg_catalog.pg_class relation
       cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl,
         pg_catalog.acldefault('r', relation.relowner))) acl
       left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
       left join pg_catalog.pg_roles grantor on grantor.oid = acl.grantor
       where relation.oid = 'public.leaderboard'::pg_catalog.regclass
         and not coalesce(
           grantor.rolname = 'postgres' and not acl.is_grantable and (
             (grantee.rolname = 'postgres' and acl.privilege_type = any(array[
               'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
             ]::text[]))
             or (grantee.rolname = 'reflab_prod_preflight_ro' and acl.privilege_type = 'SELECT')
           ), false)
     ) then
    raise exception 'Leaderboard ACL fingerprint mismatch'
      using errcode = '55000';
  end if;

  if (select pg_catalog.array_agg(distinct attribute.attname::text order by attribute.attname::text)
      from pg_catalog.pg_rewrite rewrite_state
      join pg_catalog.pg_depend dependency on dependency.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
        and dependency.objid = rewrite_state.oid
        and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      join pg_catalog.pg_attribute attribute on attribute.attrelid = dependency.refobjid
        and attribute.attnum = dependency.refobjsubid
      where rewrite_state.ev_class = 'public.leaderboard'::pg_catalog.regclass
        and dependency.refobjid = 'public.attempts'::pg_catalog.regclass)
        is distinct from array['score','user_id','var_review']::text[]
     or exists (
       select 1
       from pg_catalog.pg_rewrite rewrite_state
       join pg_catalog.pg_depend dependency on dependency.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
         and dependency.objid = rewrite_state.oid
         and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
       left join pg_catalog.pg_attribute attribute on attribute.attrelid = dependency.refobjid
         and attribute.attnum = dependency.refobjsubid
       where rewrite_state.ev_class = 'public.leaderboard'::pg_catalog.regclass
         and dependency.refobjid <> 'public.leaderboard'::pg_catalog.regclass
         and (dependency.refobjid <> 'public.attempts'::pg_catalog.regclass
           or attribute.attname is null
           or attribute.attname not in ('score','user_id','var_review'))
     ) then
    raise exception 'Leaderboard upstream dependency fingerprint mismatch'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_depend dependency
    join pg_catalog.pg_rewrite rewrite_state on rewrite_state.oid = dependency.objid
    where dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      and dependency.refobjid = 'public.leaderboard'::pg_catalog.regclass
      and dependency.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
      and rewrite_state.ev_class <> 'public.leaderboard'::pg_catalog.regclass
  ) then
    raise exception 'Leaderboard gained downstream dependencies'
      using errcode = '55000';
  end if;

  if pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_institution_sport_created_idx'))
       is distinct from 'CREATE INDEX attempts_institution_sport_created_idx ON public.attempts USING btree (institution_id, sport_type, created_at DESC)'
     or pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_user_sport_created_idx'))
       is distinct from 'CREATE INDEX attempts_user_sport_created_idx ON public.attempts USING btree (user_id, sport_type, created_at DESC)' then
    raise exception 'Created-at dependency index contract mismatch'
      using errcode = '55000';
  end if;
end
$preflight$;

drop view public.leaderboard;

alter table public.attempts
  alter column created_at drop default,
  alter column created_at type timestamp with time zone
    using created_at at time zone 'UTC',
  alter column created_at set default pg_catalog.now(),
  alter column created_at set not null,
  alter column score type numeric(7,2)
    using score::numeric(7,2);

alter table public.clips
  add column status text not null default 'published';

create view public.leaderboard as
select user_id,
  pg_catalog.count(*) as attempts,
  pg_catalog.round(pg_catalog.avg(score)) as avg_score,
  pg_catalog.max(score) as best_score,
  pg_catalog.sum(
    case
      when var_review then 1
      else 0
    end
  ) as var_yes
from public.attempts
group by user_id
order by pg_catalog.round(pg_catalog.avg(score)) desc, pg_catalog.count(*) desc;

alter view public.leaderboard owner to postgres;
revoke all on table public.leaderboard
  from public, anon, authenticated, service_role, reflab_rls_owner,
    reflab_preflight_audit_owner, reflab_prod_preflight_ro;
grant select on table public.leaderboard to reflab_prod_preflight_ro;

do $postflight$
declare
  leaderboard_definition_hash text;
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'created_at'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'timestamp with time zone'
      and attribute.attnotnull
      and pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) = 'now()'
  ) or not exists (
    select 1 from pg_catalog.pg_attribute attribute
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'score'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'numeric(7,2)'
      and not attribute.attnotnull and default_record.oid is null
  ) or not exists (
    select 1 from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where attribute.attrelid = 'public.clips'::pg_catalog.regclass
      and attribute.attname = 'status'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
      and attribute.attnotnull
      and pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) = '''published''::text'
  ) then
    raise exception 'Pre-Phase2B adoption postcondition schema mismatch'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from public.attempts) <> 37
     or (select pg_catalog.count(*) from public.exam_results) <> 6
     or (select pg_catalog.count(*) from public.notification_events) <> 60
     or (select pg_catalog.count(*) from public.attempts where created_at is null) <> 0
     or (select pg_catalog.count(*) from public.attempts where score is not null) <> 36
     or (select pg_catalog.count(*) from public.attempts where score is null) <> 1
     or (select pg_catalog.min(score) from public.attempts) <> 25.00
     or (select pg_catalog.max(score) from public.attempts) <> 100.00
     or (select pg_catalog.count(*) from public.clips) <> 30
     or (select pg_catalog.count(*) from public.clips where status = 'published') <> 30
     or (select pg_catalog.count(*) from public.clips where status is null or status <> 'published') <> 0
     or (select pg_catalog.count(*) from public.clips where is_active) <> 30
     or (select pg_catalog.count(*) from public.exam_results result
         left join public.referee_exam_sessions session on session.id = result.exam_session_id
         where session.id is null) <> 6
     or (select pg_catalog.count(*) from public.attempts attempt
         where attempt.exam_result_id is null
           and nullif(attempt.criterion_result->>'scoring_version', '') is null) <> 37 then
    raise exception 'Pre-Phase2B adoption postcondition data mismatch'
      using errcode = '55000';
  end if;

  select pg_catalog.encode(
    extensions.digest(pg_catalog.pg_get_viewdef('public.leaderboard'::pg_catalog.regclass, true), 'sha256'),
    'hex'
  ) into leaderboard_definition_hash;
  if not exists (
       select 1 from pg_catalog.pg_class relation
       join pg_catalog.pg_roles owner_role on owner_role.oid = relation.relowner
       where relation.oid = 'public.leaderboard'::pg_catalog.regclass
         and relation.relkind = 'v' and relation.relpersistence = 'p'
         and relation.reloptions is null and owner_role.rolname = 'postgres'
         and pg_catalog.obj_description(relation.oid, 'pg_class') is null
     )
     or leaderboard_definition_hash <> 'f422129265876fb2ebecba5b977562893e6451c7278026c9a71cf1864804f623'
     or (select pg_catalog.count(*) from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attnum > 0 and not attisdropped) <> 5
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'user_id' and attnum = 1 and pg_catalog.format_type(atttypid, atttypmod) = 'text')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'attempts' and attnum = 2 and pg_catalog.format_type(atttypid, atttypmod) = 'bigint')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'avg_score' and attnum = 3 and pg_catalog.format_type(atttypid, atttypmod) = 'numeric')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'best_score' and attnum = 4 and pg_catalog.format_type(atttypid, atttypmod) = 'numeric')
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.leaderboard'::pg_catalog.regclass and attname = 'var_yes' and attnum = 5 and pg_catalog.format_type(atttypid, atttypmod) = 'bigint')
     or (select pg_catalog.count(*) from pg_catalog.aclexplode((select relacl from pg_catalog.pg_class where oid = 'public.leaderboard'::pg_catalog.regclass))) <> 9
     or exists (
       select 1
       from pg_catalog.pg_class relation
       cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl,
         pg_catalog.acldefault('r', relation.relowner))) acl
       left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
       left join pg_catalog.pg_roles grantor on grantor.oid = acl.grantor
       where relation.oid = 'public.leaderboard'::pg_catalog.regclass
         and not coalesce(
           grantor.rolname = 'postgres' and not acl.is_grantable and (
             (grantee.rolname = 'postgres' and acl.privilege_type = any(array[
               'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
             ]::text[]))
             or (grantee.rolname = 'reflab_prod_preflight_ro' and acl.privilege_type = 'SELECT')
           ), false)
     )
     or (select pg_catalog.array_agg(distinct attribute.attname::text order by attribute.attname::text)
       from pg_catalog.pg_rewrite rewrite_state
       join pg_catalog.pg_depend dependency on dependency.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
         and dependency.objid = rewrite_state.oid
         and dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
       join pg_catalog.pg_attribute attribute on attribute.attrelid = dependency.refobjid
         and attribute.attnum = dependency.refobjsubid
       where rewrite_state.ev_class = 'public.leaderboard'::pg_catalog.regclass
         and dependency.refobjid = 'public.attempts'::pg_catalog.regclass)
       is distinct from array['score','user_id','var_review']::text[]
     or exists (
       select 1 from pg_catalog.pg_depend dependency
       join pg_catalog.pg_rewrite rewrite_state on rewrite_state.oid = dependency.objid
       where dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
         and dependency.refobjid = 'public.leaderboard'::pg_catalog.regclass
         and dependency.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
         and rewrite_state.ev_class <> 'public.leaderboard'::pg_catalog.regclass
     ) then
    raise exception 'Leaderboard recreation postcondition mismatch'
      using errcode = '55000';
  end if;

  if pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_institution_sport_created_idx'))
       is distinct from 'CREATE INDEX attempts_institution_sport_created_idx ON public.attempts USING btree (institution_id, sport_type, created_at DESC)'
     or pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_user_sport_created_idx'))
       is distinct from 'CREATE INDEX attempts_user_sport_created_idx ON public.attempts USING btree (user_id, sport_type, created_at DESC)'
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
     or pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is not null
     or pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is not null then
    raise exception 'Pre-Phase2B adoption protected postcondition mismatch'
      using errcode = '55000';
  end if;
end
$postflight$;

commit;
