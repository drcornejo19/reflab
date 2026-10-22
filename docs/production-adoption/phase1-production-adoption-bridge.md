# Phase 1 Production Adoption Bridge

## Purpose

Production is a historical RefLab database, not an installation of the empty-database canonical baseline. Phase 1 prepares additive compatibility without claiming that the canonical baseline is installed and without enabling the canonical runtime.

The bridge is intentionally separate from `202607270000_reflab_canonical_baseline.sql`. That migration, every Development identity migration, and every destructive security cutover remain forbidden during this phase.

## Confirmed Current State

- Clerk subjects with the `user_` prefix are the current canonical `user_id` contract and must not be rewritten.
- `reflab_private.user_identity_links` is Development-only and is not a Production requirement.
- `public.psychology_modules`, `public.referee_exam_sessions`, and `reflab_meta.reflab_schema_state` are absent.
- Historical `exam_results`, `attempts`, and notification events must remain byte-for-byte semantically intact.
- Existing semantic audits are blocked when RLS visibility cannot be proved. A zero count behind RLS is not evidence.
- Legacy identity helpers remain referenced by historical SQL policies/functions and cannot be removed in Phase 1.
- Broad browser grants, policy drift, trigger drift, index drift, and missing business RPCs remain separate security-cutover work.

## Phase 1 Migration Set

### 1. `production_adoption_foundation`

Creates the private/meta schemas, the exact but empty `reflab_meta.reflab_schema_state` table contract, and an append-only `reflab_meta.production_adoption_state` ledger. The empty schema-state table lets later canonical incrementals create policies and functions without claiming installation. The ledger records that an audited historical database entered a controlled bridge; it never represents canonical installation.

The migration requires the already-audited restricted `reflab_rls_owner` role, refuses pre-existing marker/link infrastructure, revokes all application-role privileges before commit, enables RLS with no policies, and records the reviewed plan and fingerprint hashes. The ledger deliberately does not use `FORCE RLS`: its table owner can append phases without `SUPERUSER` or `BYPASSRLS`, while application roles have neither schema usage nor table privileges.

### 2. `production_adoption_exam_training_prerequisites`

Creates an inaccessible `public.referee_exam_sessions` table and adds nullable compatibility columns required by canonical Exam and Training code. Existing rows receive no synthetic session, source reference, submission, hash, or identity values. `attempts.canonical_payload_hash` and its check remain owned by `202608130001_canonical_training_attempts.sql`; the bridge does not duplicate them.

Constraints are staged so both historical rows and legacy writes remain valid. All-null source references remain accepted. `attempts_exam_source_check` is deferred until canonical Exam runtime cutover because `NOT VALID` would still reject new legacy official attempts. Canonical-only `NOT NULL` requirements and business triggers are also deferred.

### 3. `production_adoption_psychology_notifications_prerequisites`

Creates the exact deterministic Psychology module catalog only after proving every existing non-null `module_slug` belongs to the reviewed canonical set. The table shape and eight seed rows match the baseline. Module foreign keys, the authenticated read policy, and the updated-at trigger are deferred to Psychology runtime/security cutover so Phase 1 cannot reject an otherwise valid legacy write. It also adds nullable notification deduplication and a partial unique index; historical events retain `NULL`.

## Adoption State

`reflab_meta.production_adoption_state` is the minimum safe provenance mechanism because Production has no visible RefLab migration history and migration application must not be fabricated.

- It is separate from `reflab_schema_state`.
- It contains no user data or PII.
- Its phases are ordered and append-only.
- Updates, deletes, skipped phases, and unknown phase names abort.
- Only the table owner can append through owner RLS bypass; the rehearsal proves that owner is a NOLOGIN, non-superuser, non-BYPASSRLS installer role. `PUBLIC`, `anon`, `authenticated`, `service_role`, and `reflab_rls_owner` receive no schema or table access.
- Runtime code must never use it as an authorization or canonical-installation guard.

The first three ordered phases are `foundation`, `exam_training_prerequisites`, and `psychology_notification_prerequisites`. Future phases are reserved for canonical objects, security cutover, runtime cutover, and final canonical provenance.

## Canonical Marker Strategy

The empty schema-state table is infrastructure, not installation. Phase 1 creates its exact table, immutable trigger, RLS, and closed ACL contract, but inserts no row. This permits later incrementals such as `202608110001`, `202608130001`, and `202608150001` to install disabled policies/functions. Their runtime RPCs continue to fail closed because no row satisfies `installation_status = 'installed' and environment = 'production'`.

No baseline version, checksum, manifest hash, environment, or installation status is written during adoption. The single canonical row may be inserted only during finalization after all object-level and semantic gates pass.

Finalization must prove, object by object:

- required tables and critical columns;
- exact function signatures, owners, security mode, search paths, and source hashes;
- exact RLS, policies, grants, triggers, indexes, and constraints;
- required RPC availability and Development RPC absence/non-executability;
- absence of unsafe direct identity readers outside the approved boundary;
- reconciled semantic integrity using a visibility-capable, aggregate-only audit path;
- a compatible canonical manifest hash and explicit adoption provenance.

An adopted database must not masquerade as an empty-baseline installation. Before finalization, the marker model must distinguish `production_adoption` from `empty_database_install` while keeping `baseline_version` as a target contract version rather than migration-history evidence. Reusing the baseline row unchanged is not approved.

## Historical Data Contract

- Existing Clerk-style `user_id` values are preserved exactly.
- Existing `exam_results` remain official and may keep `exam_session_id` and `payload_hash` as `NULL`.
- Existing attempts keep new source/hash columns as `NULL`; no source is inferred from legacy text or clip fields.
- Legacy official-attempt writes with `exam_result_id` and no source tuple remain accepted until Exam cutover.
- Existing notification events keep `deduplication_key = NULL`.
- Existing Psychology rows are never recategorized. Unknown non-null module slugs abort the catalog migration for manual review.
- `match_preparations` and `post_match_reviews` continue deriving fixture context through `appointment_id`; no `fixture_id` is added.

## Existing Incremental Migrations

`incremental_requires_adoption` does not mean immediately executable on historical Production. The existing migrations remain blocked until their complete prerequisites are adopted.

The comment in `202608110001_canonical_admin_user_access.sql` describes the Development chain only. Production must never run `202608030001_development_identity_resolution.sql`. Its real Production prerequisites are canonical access tables, the restricted helper owner, the empty schema-state infrastructure, reconciled RLS/policies, and approved admin mutation grants. Installation of its functions may occur before finalization, but invocation remains disabled by the absent marker row.

`202608130001` remains the sole owner of `canonical_payload_hash`, its check, the canonical Training idempotency index, policies, grants, and RPC. It may run only after the bridge source columns, `canonical_jsonb_text`, access dependencies, and security reconciliation exist. `202608150001` follows `202608130001` and intentionally replaces `attempts_source_type_check` to add `communication_feedback`.

The migration files are preserved as historical artifacts; this correction is recorded in the dependency graph instead of rewriting an existing migration checksum.

## Security Cutover Deliberately Deferred

Phase 1 does not address the broad grant/policy drift by mass revocation. A later reconciliation must classify explicit and default ACLs by object and grantee, determine runtime callers, introduce replacement server boundaries, and revoke in ordered batches with rollback evidence.

The reconciliation inventory is partitioned before any grant change:

| Object class | Required analysis | Phase 1 action |
| --- | --- | --- |
| `public` canonical product tables | distinguish owner/default ACL grants from explicit app grants; map browser callers and server boundaries | inventory only; no revoke |
| `public` legacy tables | prove ownership, runtime callers, historical data retention, and replacement path | preserve temporarily |
| `storage` schemas/tables | evaluate bucket metadata, `storage.objects` policies, and grants independently | no Storage change |
| schemas and sequences | resolve inherited `PUBLIC`, `anon`, and `authenticated` privileges and sequence dependencies | inventory only |
| routines | classify expected service-role RPCs, browser-executable routines, legacy helpers, and inherited `PUBLIC EXECUTE` | no execute-grant change |

For every class, effective privileges must be expanded through role memberships and `PUBLIC`; the grantor alone is not evidence of safety. `service_role` is audited separately from browser roles and is not included in a blanket revoke. A later cutover must introduce and verify the replacement server boundary before removing each currently used privilege.

The same applies to missing policies, policy contract drift, business functions, business triggers, and indexes unrelated to the additive prerequisites in this bridge.

## Migration History

The absence of `supabase_migrations.schema_migrations` is not repaired. Git migration files, structural fingerprints, and the append-only adoption ledger are separate evidence sources. No object match is treated as proof that a migration ran, and no synthetic migration-history row is allowed.

## Rollback and Failure

- Every migration is a single transaction with conservative lock and statement timeouts.
- Any unexpected owner, schema, table, column, constraint, index, role, RPC, or historical value shape aborts before commit.
- Migration 1 rollback removes only newly created adoption schemas, empty schema-state infrastructure, and ledger when the transaction aborts.
- Migration 2 rollback removes all newly created columns/table/indexes/constraints atomically.
- Migration 3 rollback removes the new catalog, foreign keys, deduplication column/index, and transition atomically.
- After a successful commit, rollback requires a separately reviewed migration; no automatic destructive rollback is provided.

## Go/No-Go Gates

Phase 1 remains **NO-GO for remote application** until a fresh privileged read-only fingerprint matches the documented preconditions, backups and isolated restore are proven, the disposable PostgreSQL rehearsal passes against a Production-shaped fixture, and a human approves every SQL statement.

Completion of Phase 1 is not approval for Preview promotion, Production runtime cutover, grant revocation, policy replacement, or canonical marker installation.
