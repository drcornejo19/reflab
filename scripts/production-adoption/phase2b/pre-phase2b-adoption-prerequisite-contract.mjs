import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";

export const PRE_PHASE2B_FORMAT = "REFLAB_PRE_PHASE2B_ADOPTION_PREREQUISITE_V1";
export const PRE_PHASE2B_OPERATION = "--production-pre-phase2b-adoption-prerequisite";
export const PRE_PHASE2B_OPT_IN = "ALLOW_PRODUCTION_PRE_PHASE2B_ADOPTION_PREREQUISITE";
export const PRE_PHASE2B_ARTIFACT =
  "supabase/migrations/20260925150422_production_adoption_pre_phase2b_schema_reconciliation.sql";
export const PRE_PHASE2B_SHA256 = "01e2fc62eb0d851b4c4616c70b37ae544ae6ae54af36a3491d68fb5484a375fe";
export const PRE_PHASE2B_PRE_QUERY_ID = "pre_phase2b_adoption_prerequisite_pre";
export const PRE_PHASE2B_POST_QUERY_ID = "pre_phase2b_adoption_prerequisite_post";

export const LEADERBOARD_PRE_DEFINITION_SHA256 =
  "f422129265876fb2ebecba5b977562893e6451c7278026c9a71cf1864804f623";
export const LEADERBOARD_NORMALIZED_DEFINITION_SHA256 =
  "1b362a36dc2726c37f2804a01a05340e34330fa94cb03dda90ff8217c9d92c4c";
export const LEADERBOARD_PRE_COLUMN_FINGERPRINT =
  "079a3619b135c118c47efe8b25d372da6792589b2a265867c15c26cd7734f29f";
export const LEADERBOARD_POST_COLUMN_FINGERPRINT =
  "310b68bfe826fcebb7134410374f8091d8852cc4db0625238fb6b5bef01f7c5e";
export const LEADERBOARD_ACL_FINGERPRINT =
  "fe5d89ce5bedf009683b8ddf794f45e04d51ffa3a83bd799a8f937c0e2473e46";
export const LEADERBOARD_UPSTREAM_FINGERPRINT =
  "d104d504e3a8a42f21dc36f6e33670a8edac704a1ffbcea39c71803c4e533e77";

export const PRE_PHASE2B_MUTATION_ACCOUNTING = Object.freeze({
  attemptsCreatedAtRowsReinterpreted: 37,
  attemptsScoreValuesConverted: 36,
  attemptsScoreNullsPreserved: 1,
  historicalClipStatusAssignments: 30,
  leaderboardDrops: 1,
  leaderboardCreates: 1,
  explicitProductUpdates: 0,
  productInserts: 0,
  productDeletes: 0,
  ledgerWrites: 0,
  schemaStateWrites: 0,
  canonicalMarkerWrites: 0,
});

const requiredChecks = Object.freeze([
  "sessionExact",
  "columnShapeExact",
  "historicalCountsExact",
  "historicalSemanticsExact",
  "clipsExact",
  "sidecarExact",
  "providerStateExact",
  "ledgerExact",
  "markerAbsent",
  "leaderboardExact",
  "createdAtIndexesExact",
  "phase2bEntryExact",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertPrePhase2bArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PRE_PHASE2B_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  if (digest !== PRE_PHASE2B_SHA256) throw new Error("Pre-Phase2B artifact hash drifted.");
  for (const pattern of [
    /created_at\s+at\s+time\s+zone\s+'UTC'/i,
    /score::numeric\(7,2\)/i,
    /add\s+column\s+status\s+text\s+not\s+null\s+default\s+'published'/i,
    /drop\s+view\s+public\.leaderboard\s*;/i,
    /create\s+view\s+public\.leaderboard\s+as/i,
    /grant\s+select\s+on\s+table\s+public\.leaderboard\s+to\s+reflab_prod_preflight_ro/i,
    /set\s+local\s+lock_timeout\s*=\s*'5s'/i,
    /set\s+local\s+statement_timeout\s*=\s*'60s'/i,
  ]) if (!pattern.test(sql)) throw new Error("Pre-Phase2B artifact scope drifted.");
  if (/\bdrop\s+view\s+[^;]*\bcascade\b/i.test(sql)
      || /\b(?:insert\s+into|update|delete\s+from|truncate)\s+public\.(?:attempts|clips|exam_results|notification_events)\b/i.test(sql)
      || /\b(?:insert|update|delete)\b[^;]*\breflab_meta\.(?:production_adoption_state|reflab_schema_state)\b/i.test(sql)
      || /^\s*create\s+(?:function|trigger|table|index)\b/im.test(sql)) {
    throw new Error("Pre-Phase2B artifact contains forbidden scope.");
  }
  return { path: PRE_PHASE2B_ARTIFACT, sha256: digest, sql };
}

function stateQuery(id, post) {
  const createdType = post ? "timestamp with time zone" : "timestamp without time zone";
  const scoreType = post ? "numeric(7,2)" : "integer";
  const bestScoreType = post ? "numeric" : "integer";
  const statusPredicate = post
    ? `exists (select 1 from column_state where table_name='clips' and column_name='status'
        and observed_type='text' and observed_not_null and observed_default='''published''::text')`
    : `not exists (select 1 from column_state where table_name='clips' and column_name='status'
        and observed_type is not null)`;
  return jsonQuery(id, `(with expected_columns(table_name,column_name) as (
    values ('attempts','created_at'),('attempts','score'),('clips','status'),('clips','is_active')
  ), column_state as (
    select expected.table_name, expected.column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      attribute.attnotnull as observed_not_null,
      pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) as observed_default
    from expected_columns expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname='public'
    left join pg_catalog.pg_class relation on relation.relnamespace=namespace.oid
      and relation.relname=expected.table_name and relation.relkind in ('r','p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid=relation.oid
      and attribute.attname=expected.column_name and attribute.attnum>0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record on default_record.adrelid=attribute.attrelid
      and default_record.adnum=attribute.attnum
  ), leaderboard_columns as (
    select attribute.attnum, attribute.attname,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid=pg_catalog.to_regclass('public.leaderboard')
      and attribute.attnum>0 and not attribute.attisdropped
  ), leaderboard_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end as grantee,
      grantor.rolname as grantor, acl.privilege_type, acl.is_grantable
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl,
      pg_catalog.acldefault('r', relation.relowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where relation.oid=pg_catalog.to_regclass('public.leaderboard')
  ), leaderboard_upstream as (
    select distinct attribute.attname::text as column_name
    from pg_catalog.pg_rewrite rewrite_state
    join pg_catalog.pg_depend dependency on dependency.classid='pg_catalog.pg_rewrite'::pg_catalog.regclass
      and dependency.objid=rewrite_state.oid
      and dependency.refclassid='pg_catalog.pg_class'::pg_catalog.regclass
    join pg_catalog.pg_attribute attribute on attribute.attrelid=dependency.refobjid
      and attribute.attnum=dependency.refobjsubid
    where rewrite_state.ev_class=pg_catalog.to_regclass('public.leaderboard')
      and dependency.refobjid=pg_catalog.to_regclass('public.attempts')
  ), training_duplicates as (
    select user_id, submission_id
    from public.attempts
    where exam_result_id is null and submission_id is not null
    group by user_id, submission_id having pg_catalog.count(*)>1
  ) select pg_catalog.json_build_object(
    'caller',current_user,'session_user',session_user,
    'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),
    'server_version_num',pg_catalog.current_setting('server_version_num')::integer,
    'checks',pg_catalog.json_build_object(
      'sessionExact', current_user='postgres' and session_user='postgres'
        and pg_catalog.current_setting('transaction_read_only')='on'
        and pg_catalog.current_setting('server_version_num')::integer/10000=17,
      'columnShapeExact',
        exists (select 1 from column_state where table_name='attempts' and column_name='created_at'
          and observed_type='${createdType}' and observed_not_null=${post ? "true" : "false"}
          and observed_default='now()')
        and exists (select 1 from column_state where table_name='attempts' and column_name='score'
          and observed_type='${scoreType}' and not observed_not_null and observed_default is null)
        and exists (select 1 from column_state where table_name='clips' and column_name='is_active'
          and observed_type='boolean' and observed_not_null and observed_default='true')
        and ${statusPredicate},
      'historicalCountsExact',
        (select pg_catalog.count(*)=37 from public.attempts)
        and (select pg_catalog.count(*)=6 from public.exam_results)
        and (select pg_catalog.count(*)=60 from public.notification_events),
      'historicalSemanticsExact',
        (select pg_catalog.count(*)=0 from public.attempts where created_at is null)
        and (select pg_catalog.count(*)=36 from public.attempts where score is not null)
        and (select pg_catalog.count(*)=1 from public.attempts where score is null)
        and (select pg_catalog.min(score)=25 and pg_catalog.max(score)=100 from public.attempts)
        and (select pg_catalog.count(*)=6 from public.exam_results result
          left join public.referee_exam_sessions session on session.id=result.exam_session_id
          where session.id is null)
        and (select pg_catalog.count(*)=37 from public.attempts attempt
          where attempt.exam_result_id is null
            and nullif(attempt.criterion_result->>'scoring_version','') is null),
      'clipsExact', (select pg_catalog.count(*)=30 and pg_catalog.count(*) filter(where is_active)=30
        ${post ? "and pg_catalog.count(*) filter(where status='published')=30 and pg_catalog.count(*) filter(where status is null or status<>'published')=0" : ""}
        from public.clips),
      'sidecarExact', pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null
        and pg_catalog.to_regrole('reflab_preflight_audit_owner') is not null
        and (select pg_catalog.count(*)=58 from pg_catalog.pg_policies where policyname='reflab_preflight_audit_owner_read')
        and (select pg_catalog.count(*)=100 from information_schema.column_privileges
          where grantee='reflab_preflight_audit_owner' and privilege_type='SELECT'),
      'providerStateExact', pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is not null
        and pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is not null
        and pg_catalog.to_regprocedure('public.admin_set_canonical_global_role(text,text,text,text)') is not null
        and pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is null
        and pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is null
        and not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.attempts'::pg_catalog.regclass
          and attname='canonical_payload_hash' and attnum>0 and not attisdropped),
      'ledgerExact', (select pg_catalog.count(*)=3 and pg_catalog.max(phase_order)=3
        and pg_catalog.count(*) filter(where phase_order=1 and phase_key='foundation')=1
        and pg_catalog.count(*) filter(where phase_order=2 and phase_key='exam_training_prerequisites')=1
        and pg_catalog.count(*) filter(where phase_order=3 and phase_key='psychology_notification_prerequisites')=1
        from reflab_meta.production_adoption_state),
      'markerAbsent',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'leaderboardExact', exists (select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_roles owner_role on owner_role.oid=relation.relowner
        where relation.oid=pg_catalog.to_regclass('public.leaderboard') and relation.relkind='v'
          and relation.relpersistence='p' and relation.reloptions is null
          and owner_role.rolname='postgres' and pg_catalog.obj_description(relation.oid,'pg_class') is null)
        and pg_catalog.encode(extensions.digest(pg_catalog.pg_get_viewdef('public.leaderboard'::pg_catalog.regclass,true),'sha256'),'hex')
          = '${LEADERBOARD_PRE_DEFINITION_SHA256}'
        and (select pg_catalog.count(*)=5 from leaderboard_columns)
        and exists (select 1 from leaderboard_columns where attnum=1 and attname='user_id' and observed_type='text')
        and exists (select 1 from leaderboard_columns where attnum=2 and attname='attempts' and observed_type='bigint')
        and exists (select 1 from leaderboard_columns where attnum=3 and attname='avg_score' and observed_type='numeric')
        and exists (select 1 from leaderboard_columns where attnum=4 and attname='best_score' and observed_type='${bestScoreType}')
        and exists (select 1 from leaderboard_columns where attnum=5 and attname='var_yes' and observed_type='bigint')
        and (select pg_catalog.count(*)=9 from leaderboard_acl)
        and (select pg_catalog.count(*)=9 from leaderboard_acl where grantor='postgres' and not is_grantable
          and ((grantee='postgres' and privilege_type=any(array['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]))
            or (grantee='reflab_prod_preflight_ro' and privilege_type='SELECT')))
        and (select pg_catalog.array_agg(column_name order by column_name) from leaderboard_upstream)
          = array['score','user_id','var_review']::text[]
        and not exists (select 1 from pg_catalog.pg_depend dependency
          join pg_catalog.pg_rewrite rewrite_state on rewrite_state.oid=dependency.objid
          where dependency.refclassid='pg_catalog.pg_class'::pg_catalog.regclass
            and dependency.refobjid=pg_catalog.to_regclass('public.leaderboard')
            and dependency.classid='pg_catalog.pg_rewrite'::pg_catalog.regclass
            and rewrite_state.ev_class<>pg_catalog.to_regclass('public.leaderboard')),
      'createdAtIndexesExact',
        pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_institution_sport_created_idx'))
          = 'CREATE INDEX attempts_institution_sport_created_idx ON public.attempts USING btree (institution_id, sport_type, created_at DESC)'
        and pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_user_sport_created_idx'))
          = 'CREATE INDEX attempts_user_sport_created_idx ON public.attempts USING btree (user_id, sport_type, created_at DESC)',
      'phase2bEntryExact', pg_catalog.to_regprocedure('extensions.digest(text,text)') is not null
        and (select pg_catalog.count(*)=0 from training_duplicates)
        and pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is null
        and pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is null
    ),
    'counts',pg_catalog.json_build_object(
      'attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'clips',(select pg_catalog.count(*) from public.clips),
      'score_non_null',(select pg_catalog.count(*) from public.attempts where score is not null),
      'score_null',(select pg_catalog.count(*) from public.attempts where score is null),
      'training_duplicate_groups',(select pg_catalog.count(*) from training_duplicates)
    )
  ))`);
}

export const prePhase2bPreQuery = stateQuery(PRE_PHASE2B_PRE_QUERY_ID, false);
export const prePhase2bPostQuery = stateQuery(PRE_PHASE2B_POST_QUERY_ID, true);

function complete(payload) {
  return payload && typeof payload === "object" && payload.checks && payload.counts
    && requiredChecks.every((check) => typeof payload.checks[check] === "boolean")
    && Number.isInteger(payload.server_version_num);
}

function classify(payload, installer, expected) {
  if (!complete(payload) || !installer) return { classification: "UNKNOWN" };
  const exact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT"
    && payload.caller === "postgres" && payload.session_user === "postgres"
    && payload.transaction_read_only === "on"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && requiredChecks.every((check) => payload.checks[check] === true)
    && payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.clips === 30
    && payload.counts.score_non_null === 36 && payload.counts.score_null === 1
    && payload.counts.training_duplicate_groups === 0;
  return { classification: exact ? expected : "BLOCKER" };
}

export function classifyPrePhase2bPre(payload, installer) {
  return classify(payload, installer, "PASS");
}

export function classifyPrePhase2bPost(payload, installer) {
  return classify(payload, installer, "EXACT");
}
