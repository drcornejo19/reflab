# Phase 2B Canonical Runtime Installation

## Decision

Phase 2B installs the Admin, Training, and Communication database contracts on
the historical Production shape while the empty canonical marker keeps every
new runtime RPC disabled. Development-only migrations are never executed, no
identity-link table is created, and existing `user_*` values are untouched.

## Dependency graph

1. `202608310001` creates the adoption ledger and empty schema-state infrastructure.
2. `202608310002` adds nullable Exam/Training prerequisites without changing legacy writes.
3. `202608310003` adds the exact Psychology catalog and nullable notification deduplication.
4. `202608310004` installs the temporary semantic audit sidecar without advancing the ledger.
5. `202608310005` supplies the exact `canonical_jsonb_text(jsonb)` helper otherwise available only from the forbidden empty-database baseline.
6. `202608110001` installs two Admin RPCs and their narrowly scoped RLS-owner policies.
7. `202608130001` remains the sole provider of `attempts.canonical_payload_hash`, its check, Training policies, and the Training RPC.
8. `202608150001` replaces `attempts_source_type_check` to add `communication_feedback` while preserving `NULL` for legacy writes, then installs the Communication RPC.
9. `202608310006` verifies the installed contracts and records ledger phase 4, `canonical_objects`.

The stale Development dependency in `202608110001` was documentation debt.
Its actual Production prerequisites are canonical access-table shapes, a safe
`reflab_rls_owner`, the reviewed adoption state, and the Phase 2B prerequisite
gate. It has no dependency on Development identity resolution.

## Disabled runtime contract

`reflab_meta.reflab_schema_state` remains present with zero rows. Phase 2B does
not insert `installation_status='installed'`, so all four RPCs fail closed. The
phase-4 adoption transition records DDL provenance only; it does not enable
runtime and cannot substitute for the final canonical marker.

## Historical compatibility

The local PostgreSQL rehearsal preserves 37 historical attempts, six historical
exam results, and 60 notification events. Historical Exam rows retain null
session/hash values, notification keys remain null, and no historical Exam
sessions are fabricated. A dedicated legacy runtime role proves that an Exam
attempt with a null source tuple can still be inserted before and after Phase
2B. Existing `user_*` values are compared deterministically before and after.

## Security boundary

The new helper is `SECURITY INVOKER`, immutable, strict, and uses
`search_path=pg_catalog`. Canonical RPCs are `SECURITY DEFINER`, owned by the
NOLOGIN/NOBYPASSRLS `reflab_rls_owner`, and executable only by `service_role`.
No PUBLIC, anon, or authenticated function execution is introduced. The
temporary semantic audit sidecar remains isolated and must be removed before
canonical finalization under the Phase 2A lifecycle contract.

## Deliberately unresolved

Phase 2B resolves only objects owned by these three incrementals. It does not
resolve the global 96 missing policies, 33 policy drifts, 791 browser DML
grants, 81 missing triggers, 42 missing indexes, or unrelated missing functions.
Those remain blockers for later security and runtime cutover phases.

## Rollback and negative gates

Every migration is transactional with bounded lock and statement timeouts.
The disposable rehearsal proves rollback for a missing dependency, incompatible
column, premature marker, Development RPC, unsafe owner role, and duplicate
provider. A failure leaves the helper/RPCs absent and the ledger at phase 3.
