# Phase 4B Wave 2: non-unique index reconciliation

Wave 2 installs only the 32 non-unique indexes that Phase 4A proved absent and not semantically represented by another index. It does not drop, rename, or replace historical indexes and does not install unique indexes or constraints.

## Decisions

- `SAFE_INSTALL`: the 32 entries in `phase4b-wave2-contract.mjs`.
- `EQUIVALENT_REUSE`: `public.clips.clips_sport_topic_active_idx` satisfies the canonical `clips_sport_topic_idx` semantics, so no duplicate is created.
- `REPLACEMENT_REQUIRES_CUTOVER`: nine reviewed drifts with wrong order, predicate, subset, or incompatible keys.
- `LEGACY_REQUIRED_TEMPORARILY`: the two historical superset indexes on institution group memberships and notification recipients.

The migration compares indexes through `pg_index`, `pg_attribute`, `pg_am`, `pg_opclass`, collation OIDs, option bits, validity/readiness, predicate/expression state, INCLUDE cardinality, ownership, and constraint backing. It does not use rendered `pg_get_indexdef()` text as the approval contract.

## Lock strategy

Wave 2 uses transactional `CREATE INDEX`, a 5-second lock timeout, and a 15-minute statement timeout. This preserves atomic rollback across the full wave. `CREATE INDEX CONCURRENTLY` is deliberately excluded because it cannot run in the migration transaction and can leave invalid indexes after interruption.

A future Production execution still requires privileged evidence for relation sizes and expected build time plus an approved maintenance window. If the lock cannot be acquired within the budget, the transaction aborts without partial Wave 2 installation.

## Deferred debt

The 11 semantic drifts, four unique indexes, unique constraints, triggers, CHECK/FK work, runtime cutover, semantic sidecar teardown, and canonical marker remain outside this wave. The adoption ledger stays at `canonical_objects` / order 4 and `reflab_schema_state` remains empty.

