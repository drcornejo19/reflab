# Phase 4A - Structural Evidence and Contract Repair

## Scope

Phase 4A is evidence-only. It does not contain an installation migration, does
not advance the adoption ledger, and does not create a canonical installation
marker. `reflab_meta.reflab_schema_state` must remain empty.

The machine-readable contract is in
`scripts/production-adoption/phase4/phase4-structural-contract.mjs`. The
evidence report is generated locally from the privileged read-only Phase 0
fingerprint by `run-phase4a-evidence.mjs`. A future privileged run must use the
catalog-only V2 query before CHECK, FK, or UNIQUE changes can be approved.

## Trigger contract repair

The canonical SQL has two different triggers on each of
`performance_sessions`, `readiness_scores`, and `wellness_logs`:

| Trigger suffix | Function | Contract |
| --- | --- | --- |
| `validate_appointment_context` | `reflab_private.validate_user_appointment_context()` | appointment, user, fixture, and sport coherence |
| `validate_checkin_owner` | `reflab_private.validate_performance_checkin_owner()` | check-in ownership coherence |

The baseline manifest generator incorrectly assigned the first suffix to both
generated families. This was a duplicate-manifest bug, not an ambiguity in the
canonical SQL. The SQL declarations remain unchanged; only the generated
manifest identities and derived integrity hashes change.

After repair the 82 trigger identities are unique. Relative to the reviewed
historical fingerprint and Phase 1 provider overlay:

- 1 canonical trigger is already provided by Phase 1.
- 50 canonical/historical pairs share the table and write event.
- 44 pairs implement the `updated_at` effect through historical helpers or
  names. They are reuse candidates, but a migration must replace rather than
  add a second trigger.
- 6 pairs use the historical monolithic
  `public.validate_institution_tenant_links()` where the canonical target uses
  a specialized validator. They are semantic drift and remain
  `LEGACY_REQUIRED_TEMPORARILY` until legacy-write compatibility is proven.
- 31 canonical triggers have no historical trigger on the same table/event.
  They are not automatically safe: validators remain write-affecting.

The exact 50-pair inventory is preserved in `phase4a-evidence-report.json`.

## Index evidence

The old preflight produced 50 apparent index drifts. Catalog-aware review
reclassified 39 as representation-only. The remaining 11 are real:

| Index | Difference | Classification |
| --- | --- | --- |
| `coach_data_consents_user_idx` | purpose/data-category key order | wrong order |
| `coach_runs_institution_created_idx` | historical index is partial | subset index |
| `competitions_association_sport_idx` | missing `is_active` key | subset index |
| `fixtures_provider_external_unique` | weaker historical predicate | wrong predicate |
| `institution_assessment_sessions_tenant_group_idx` | `created_at` replaces canonical `status` | incompatible |
| `institution_demo_sessions_user_status_idx` | `expires_at DESC` instead of canonical order | wrong order |
| `institution_group_memberships_member_idx` | historical index adds `group_id` | superset index |
| `institution_notification_recipients_user_idx` | historical index adds `created_at DESC` | superset index |
| `performance_checkins_user_date_type_idx` | historical date order is descending | wrong order |
| `teams_provider_external_unique` | weaker historical predicate | wrong predicate |
| `venues_provider_external_unique` | weaker historical predicate | wrong predicate |

There are 37 missing canonical names after the Phase 1-3 provider overlay.
`clips_sport_topic_idx` is semantically represented by
`clips_sport_topic_active_idx`, leaving 36 truly missing indexes: 32 non-unique
and 4 unique. None is installed in Phase 4A.

For Phase 4B, ordinary transactional `CREATE INDEX` is preferred only when a
measured lock budget is acceptable. `CREATE INDEX CONCURRENTLY` cannot run in
the normal migration transaction and needs a separately controlled operation,
failure cleanup, and resumability contract. The choice is per index, never a
global default.

## UNIQUE evidence

Thirteen canonical UNIQUE contracts remain pending. Phase 4A does not claim
zero duplicates because the existing fingerprint contains no privileged
aggregate duplicate proof.

The disposable PostgreSQL rehearsal audits only the structures represented by
the synthetic historical fixture. Six contracts are modeled and returned zero
duplicate groups: `exam_results(user_id, submission_id)`,
`institution_groups(id, institution_id)`,
`institution_memberships(id, institution_id)`,
`institution_subscriptions(institution_id)`, `user_profiles(ref_card_id)`, and
`user_subscriptions(user_id)`. Seven remain explicitly unmodeled: assessment
assignments, assessment sessions (missing `institution_id` in the fixture),
assessments, cohorts, contents, notification campaigns, and institution roles.
The runner returns `duplicateCount = null` for every unmodeled contract.

These local zero-duplicate aggregates validate the harness and synthetic
fixture only. They do not promote any UNIQUE to safe installation: all 13 still
require equivalent privileged, read-only aggregate evidence from Production.

Two have historical partial unique indexes:

- `exam_results(user_id, submission_id)` where `submission_id is not null`.
- `user_profiles(ref_card_id)` where `ref_card_id is not null`.

These indexes implement comparable nullable-key duplicate prevention, but are
not structurally the same as full UNIQUE constraints and cannot be assumed to
provide the same FK-target or deferrability contract. All 13 remain
`REQUIRES_DATA_VALIDATION`. A future evidence run may return only duplicate
group counts and maximum group size, never key values.

## CHECK and FK evidence

The baseline manifest now preserves CHECK validation/no-inherit metadata and
FK match type, update/delete actions, ordered columns, deferrability, initial
deferment, and validation state. The V1 Production fingerprint does not carry
all of those fields.

Consequently:

- CHECK: 297 canonical; 1 explicitly `CUTOVER_ONLY`
  (`attempts_exam_source_check`); 296 require a V2 comparison before they can
  be classified exact, missing, or drifted.
- FK: 61 canonical; all 61 require V2 evidence before classification.

This is intentionally fail-closed. `NOT VALID` is not used as a shortcut:
although it preserves old rows, it still constrains new writes and can break
the legacy runtime between phases.

## Functions

After Phase 3 there are 18 missing canonical functions and one drifted
function.

- Sixteen private baseline helpers are safe to install only as inert function
  definitions with exact signature, owner, mode, search path, source hash, and
  closed EXECUTE ACL. Their triggers are separate waves.
- `submit_referee_exam(text,uuid,uuid,text,jsonb)` and
  `accept_canonical_institution_invitation(text,uuid,text[])` are runtime RPCs,
  not inert helpers. They are cutover-gated.
- `consume_coach_rate_limit(text,text,integer,integer)` exists historically but
  differs in source, owner, security mode, and search path. Its provider remains
  `202608200001`; replacement is cutover-gated.
- The historical 13-argument `submit_referee_exam` overload remains legacy
  until caller evidence permits removal.

## Proposed Phase 4B waves

1. Install exact inert private helpers with no browser/PUBLIC EXECUTE.
2. Install only V2-confirmed missing non-unique indexes under per-index lock
   plans.
3. Reuse or replace the 44 `updated_at` trigger pairs without double execution.
4. Add only UNIQUE contracts with privileged zero-duplicate evidence and
   legacy-write compatibility.
5. Add only CHECK/FK contracts proven safe for existing rows and between-phase
   writes.
6. At runtime cutover, reconcile the six institutional validators, runtime
   RPCs, and `attempts_exam_source_check`.

## Go/no-go

Phase 4B remains NO-GO for constraints and write-affecting validators until:

- a privileged, read-only Structural Fingerprint V2 is captured;
- all 13 UNIQUE aggregate audits are complete;
- legacy writes are replayed against each proposed CHECK/FK/trigger change;
- provider ownership remains unique;
- index lock strategy is approved object by object.

No Phase 4 installation migration exists at the end of Phase 4A.
