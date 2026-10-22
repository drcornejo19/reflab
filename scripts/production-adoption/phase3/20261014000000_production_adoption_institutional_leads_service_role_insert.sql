-- Local candidate only: isolated institutional_leads INSERT, never chronological migration push.
-- Full predecessor/target/committed-HEAD contract is mandatory in a future reviewed execution harness.
begin;
set local search_path=pg_catalog,public;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local idle_in_transaction_session_timeout='15s';
set local transaction_timeout='180s';
do $lead_insert$
declare before_state jsonb; after_state jsonb;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' or current_database() <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or (select rolsuper from pg_roles where rolname='postgres') then
    raise exception 'Managed PostgreSQL 17 installer required' using errcode='55000';
  end if;
  lock table public.institutional_leads in access exclusive mode;
  before_state := (with relation as (select c.* from pg_catalog.pg_class c
  where c.oid=pg_catalog.to_regclass('public.institutional_leads') and c.relkind='r')
select jsonb_build_object(
 'tableCount',(select count(*) from relation),
 'owner',(select pg_get_userbyid(relowner) from relation),
 'rls',(select relrowsecurity from relation),'force',(select relforcerowsecurity from relation),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attname),'[]')
   from relation r join pg_attribute a on a.attrelid=r.oid where a.attnum>0 and not a.attisdropped),
 'rawService',(select coalesce(jsonb_agg(jsonb_build_object('privilege',x.privilege_type,'grantor',pg_get_userbyid(x.grantor),
   'grantable',x.is_grantable) order by x.privilege_type),'[]') from relation r
   cross join lateral aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) x where x.grantee=to_regrole('service_role')),
 'effectiveService',(select coalesce(jsonb_agg(jsonb_build_object('privilege',p,'granted',has_table_privilege('service_role',r.oid,p)) order by p),'[]')
   from relation r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
 'browser',(select coalesce(jsonb_agg(jsonb_build_object('role',role,'privilege',p,'granted',case when role='PUBLIC' then
   exists(select 1 from aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) x where x.grantee=0 and x.privilege_type=p)
   else has_table_privilege(role,r.oid,p) end) order by role,p),'[]') from relation r
   cross join unnest(array['PUBLIC','anon','authenticated']) role cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
 'columnWriteSubstitutes',(select count(*) from relation r join pg_attribute a on a.attrelid=r.oid
   cross join lateral aclexplode(a.attacl) x where a.attnum>0 and not a.attisdropped
   and (x.grantee=0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role'))),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',(select jsonb_agg(case when role=0 then 'PUBLIC' else pg_get_userbyid(role) end order by role) from unnest(p.polroles) role),
   'using',pg_get_expr(p.polqual,p.polrelid,false),'withCheck',pg_get_expr(p.polwithcheck,p.polrelid,false)) order by p.polname),'[]')
   from relation r join pg_policy p on p.polrelid=r.oid),
 'serviceBypass',(select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),
 'serviceMemberships',(select count(*) from pg_auth_members where member=to_regrole('service_role')),
 'protected',md5(jsonb_build_object(
   'tableAcls',(select jsonb_agg(jsonb_build_array(c.oid,x.grantee,x.grantor,x.privilege_type,x.is_grantable)
     order by c.oid,x.grantee,x.grantor,x.privilege_type) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
     where n.nspname='public' and c.relkind in ('r','p') and not(c.oid=to_regclass('public.institutional_leads')
       and x.grantee=to_regrole('service_role') and x.privilege_type='INSERT')),
   'columns',(select jsonb_agg(to_jsonb(a) order by a.attnum) from relation r join pg_attribute a on a.attrelid=r.oid where a.attnum>0),
   'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
   'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.proconfig,p.prosrc) order by p.oid)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reflab_private','reflab_audit')),
   'rows',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]')::text) from public.institutional_leads x)
 )::text)
));
  if before_state->>'owner' <> 'postgres' or before_state->>'tableCount' <> '1'
     or before_state->>'rls' <> 'true' or before_state->>'force' <> 'false'
     or before_state->>'serviceBypass' <> 'true' or before_state->>'serviceMemberships' <> '0'
     or before_state->>'columnWriteSubstitutes' <> '0'
     or before_state->'columns' is distinct from '[{"column":"archived_at","type":"timestamp with time zone"},{"column":"city","type":"text"},{"column":"converted_at","type":"timestamp with time zone"},{"column":"converted_by_user_id","type":"text"},{"column":"converted_institution_id","type":"uuid"},{"column":"country","type":"text"},{"column":"created_at","type":"timestamp with time zone"},{"column":"email","type":"text"},{"column":"first_name","type":"text"},{"column":"full_name","type":"text"},{"column":"id","type":"uuid"},{"column":"institution_name","type":"text"},{"column":"institution_type","type":"text"},{"column":"instructor_count","type":"integer"},{"column":"interest","type":"text"},{"column":"interest_areas","type":"text[]"},{"column":"last_name","type":"text"},{"column":"lost_reason","type":"text"},{"column":"message","type":"text"},{"column":"next_contact_at","type":"timestamp with time zone"},{"column":"notes","type":"text"},{"column":"owner_user_id","type":"text"},{"column":"potential_plan","type":"text"},{"column":"referee_count","type":"integer"},{"column":"role","type":"text"},{"column":"source","type":"text"},{"column":"status","type":"text"},{"column":"updated_at","type":"timestamp with time zone"},{"column":"whatsapp","type":"text"}]'::jsonb
     or before_state->'policies' is distinct from '[{"name":"reflab_preflight_audit_owner_read","command":"r","permissive":true,"roles":["reflab_preflight_audit_owner"],"using":"true","withCheck":null}]'::jsonb
     or before_state->'rawService' is distinct from '[{"privilege":"SELECT","grantor":"postgres","grantable":false},{"privilege":"UPDATE","grantor":"postgres","grantable":false}]'::jsonb
     or before_state->'effectiveService' is distinct from '[{"privilege":"DELETE","granted":false},{"privilege":"INSERT","granted":false},{"privilege":"MAINTAIN","granted":false},{"privilege":"REFERENCES","granted":false},{"privilege":"SELECT","granted":true},{"privilege":"TRIGGER","granted":false},{"privilege":"TRUNCATE","granted":false},{"privilege":"UPDATE","granted":true}]'::jsonb
     or jsonb_array_length(before_state->'browser') <> 24
     or exists(select 1 from jsonb_array_elements(before_state->'browser') b where (b->>'granted')::boolean) then
    raise exception 'Exact institutional_leads PRE required; reexecution refused' using errcode='55000';
  end if;
  grant insert on table public.institutional_leads to service_role;
  after_state := (with relation as (select c.* from pg_catalog.pg_class c
  where c.oid=pg_catalog.to_regclass('public.institutional_leads') and c.relkind='r')
select jsonb_build_object(
 'tableCount',(select count(*) from relation),
 'owner',(select pg_get_userbyid(relowner) from relation),
 'rls',(select relrowsecurity from relation),'force',(select relforcerowsecurity from relation),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attname),'[]')
   from relation r join pg_attribute a on a.attrelid=r.oid where a.attnum>0 and not a.attisdropped),
 'rawService',(select coalesce(jsonb_agg(jsonb_build_object('privilege',x.privilege_type,'grantor',pg_get_userbyid(x.grantor),
   'grantable',x.is_grantable) order by x.privilege_type),'[]') from relation r
   cross join lateral aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) x where x.grantee=to_regrole('service_role')),
 'effectiveService',(select coalesce(jsonb_agg(jsonb_build_object('privilege',p,'granted',has_table_privilege('service_role',r.oid,p)) order by p),'[]')
   from relation r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
 'browser',(select coalesce(jsonb_agg(jsonb_build_object('role',role,'privilege',p,'granted',case when role='PUBLIC' then
   exists(select 1 from aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) x where x.grantee=0 and x.privilege_type=p)
   else has_table_privilege(role,r.oid,p) end) order by role,p),'[]') from relation r
   cross join unnest(array['PUBLIC','anon','authenticated']) role cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p),
 'columnWriteSubstitutes',(select count(*) from relation r join pg_attribute a on a.attrelid=r.oid
   cross join lateral aclexplode(a.attacl) x where a.attnum>0 and not a.attisdropped
   and (x.grantee=0 or pg_get_userbyid(x.grantee) in ('anon','authenticated','service_role'))),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',(select jsonb_agg(case when role=0 then 'PUBLIC' else pg_get_userbyid(role) end order by role) from unnest(p.polroles) role),
   'using',pg_get_expr(p.polqual,p.polrelid,false),'withCheck',pg_get_expr(p.polwithcheck,p.polrelid,false)) order by p.polname),'[]')
   from relation r join pg_policy p on p.polrelid=r.oid),
 'serviceBypass',(select rolbypassrls and not rolsuper from pg_roles where rolname='service_role'),
 'serviceMemberships',(select count(*) from pg_auth_members where member=to_regrole('service_role')),
 'protected',md5(jsonb_build_object(
   'tableAcls',(select jsonb_agg(jsonb_build_array(c.oid,x.grantee,x.grantor,x.privilege_type,x.is_grantable)
     order by c.oid,x.grantee,x.grantor,x.privilege_type) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
     where n.nspname='public' and c.relkind in ('r','p') and not(c.oid=to_regclass('public.institutional_leads')
       and x.grantee=to_regrole('service_role') and x.privilege_type='INSERT')),
   'columns',(select jsonb_agg(to_jsonb(a) order by a.attnum) from relation r join pg_attribute a on a.attrelid=r.oid where a.attnum>0),
   'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
   'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.proconfig,p.prosrc) order by p.oid)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reflab_private','reflab_audit')),
   'rows',(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]')::text) from public.institutional_leads x)
 )::text)
));
  if after_state->'rawService' is distinct from '[{"privilege":"INSERT","grantor":"postgres","grantable":false},{"privilege":"SELECT","grantor":"postgres","grantable":false},{"privilege":"UPDATE","grantor":"postgres","grantable":false}]'::jsonb
     or after_state->'effectiveService' is distinct from '[{"privilege":"DELETE","granted":false},{"privilege":"INSERT","granted":true},{"privilege":"MAINTAIN","granted":false},{"privilege":"REFERENCES","granted":false},{"privilege":"SELECT","granted":true},{"privilege":"TRIGGER","granted":false},{"privilege":"TRUNCATE","granted":false},{"privilege":"UPDATE","granted":true}]'::jsonb
     or (after_state - 'rawService' - 'effectiveService') is distinct from (before_state - 'rawService' - 'effectiveService') then
    raise exception 'Exact institutional_leads POST and preservation required' using errcode='55000';
  end if;
end
$lead_insert$;
commit;
