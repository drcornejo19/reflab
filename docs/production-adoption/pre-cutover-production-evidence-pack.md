# Pre-Cutover Production Evidence Pack

## Purpose

This pack captures the minimum privileged, read-only evidence still required after Phase 4B. It does not authorize DDL, data repair, cutover, or the canonical installation marker. Local fixture results prove only the pack contract and never represent Production evidence.

The contract contains 442 stable evidence IDs: 13 UNIQUE, 268 CHECK, 124 FK, 2 nullability, 11 index drift, 6 legacy validator, 5 legacy caller target, and 13 privilege-edge items.

## Batches

`pre-cutover-catalog-evidence.sql` runs directly as `reflab_prod_preflight_ro`. It reads only `pg_catalog` and reports catalog metadata, caller identities, and reviewed privilege edges. It does not read protected product rows.

`pre-cutover-aggregate-evidence.sql` calls `reflab_audit.pre_cutover_evidence_snapshot_v1()`. The function returns 405 evidence-linked aggregate metrics: duplicate groups, CHECK violations, FK orphans, the two nullability counts, and the approved `notification_events.status`/count distribution. It never returns row identifiers or application data.

Both batches use `BEGIN READ ONLY`, conservative local timeouts, verify `transaction_read_only`, and end with `ROLLBACK`. The static validator rejects writes, DDL, grants, revokes, and role changes. Query error, timeout, or unproven visibility is `UNKNOWN`; a missing dependency is `SKIPPED`; neither can become `PASS`.

## Temporary Boundary

Migration `20260901064301_production_adoption_pre_cutover_evidence_boundary.sql` is `ADOPTION_TEMPORARY`. It does not change `reflab_audit.production_semantic_snapshot()`.

The dedicated owner `reflab_pre_cutover_evidence_owner` is `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`, with no memberships. It owns only `reflab_audit.pre_cutover_evidence_snapshot_v1()`. The function is argument-free, SQL, `STABLE`, `SECURITY DEFINER`, and has `search_path=pg_catalog`; its normalized source hash is pinned by the generator.

The owner receives only the generated per-column `SELECT` grants and one exact SELECT policy named `reflab_pre_cutover_evidence_owner_read` on each required RLS table. `EXECUTE` is granted only to `reflab_prod_preflight_ro`; PUBLIC, anon, authenticated, service_role, `reflab_rls_owner`, and the Phase 2A audit owner have no execute privilege.

## Lifecycle And Teardown

The boundary may exist only while privileged evidence is being collected and reconciled. It must be removed after every required evidence item has a reviewed disposition and before final canonical validation or insertion into `reflab_meta.reflab_schema_state`.

Teardown must atomically remove the versioned function, its 76 named RLS policies, all generated column/schema grants, and the dedicated role after proving there are no remaining dependencies. A future teardown migration will own that operation; this pack intentionally does not create it.

The Production preflight emits `BLOCKER_TEMPORARY_PRE_CUTOVER_EVIDENCE_PRESENT` while any role, function, policy, or grant from this boundary remains. The existing Phase 2A sidecar has its separate teardown blocker and lifecycle.

## Result Consequences

| Result | Consequence |
| --- | --- |
| `PASS` | Evidence was observed under the declared method; it does not authorize DDL automatically. |
| `BLOCKER` | The observed aggregate or catalog contract prevents cutover. |
| `UNKNOWN` | Query failure, timeout, or visibility uncertainty requires investigation. |
| `SKIPPED` | A dependency is missing; the evidence item remains unresolved. |

No result may infer `pending == queued`, fabricate a backfill, expose protected row values, or substitute synthetic fixture observations for Production evidence.
