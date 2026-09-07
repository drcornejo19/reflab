-- Generated pre-cutover aggregate evidence. Read-only by construction.
begin read only;
set local statement_timeout = '5min';
set local lock_timeout = '2s';
show transaction_read_only;
select case when pg_catalog.current_setting('transaction_read_only')='on'
  then reflab_audit.pre_cutover_evidence_snapshot_v1()
  else null end::text;
rollback;
