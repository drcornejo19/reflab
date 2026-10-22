# Phase 4B Wave 4: UNIQUE evidence and safe reconciliation

Wave 4 is evidence-only. It creates no Production migration because local
synthetic data cannot authorize a UNIQUE constraint on historical Production
rows. The read-only gate validates catalog shape and duplicate aggregates but
does not advance `production_adoption_state` or insert a canonical marker.

## Reviewed contracts

| Table | Canonical key | Local duplicate groups / max | Classification |
| --- | --- | --- | --- |
| `exam_results` | `user_id, submission_id` | `0 / 0` | `EQUIVALENT_REUSE` of reviewed partial index |
| `institution_assessment_assignments` | `id, institution_id, assessment_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_assessment_sessions` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_assessments` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_cohorts` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_contents` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_groups` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_memberships` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_notification_campaigns` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_roles` | `id, institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `institution_subscriptions` | `institution_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |
| `user_profiles` | `ref_card_id` | `0 / 0` | `EQUIVALENT_REUSE` of reviewed partial index |
| `user_subscriptions` | `user_id` | `0 / 0` | `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE` |

The seven structures previously absent from the synthetic fixture are now
modeled only with canonical columns derived from the baseline. No synthetic
historical rows are added. A local zero therefore proves only that the harness
can perform the aggregate safely; it is not Production evidence.

## Partial unique indexes

`exam_results_user_submission_unique` excludes rows whose `submission_id` is
null. `user_profiles_ref_card_id_unique` excludes rows whose `ref_card_id` is
null. Under the canonical `NULLS DISTINCT` rule these predicates enforce the
same duplicate-prevention behavior as the corresponding full UNIQUE keys:
rows containing a null are not mutually conflicting.

The indexes are nevertheless structurally different from UNIQUE constraints:
they have predicates, are not constraint-backed, and cannot automatically
satisfy a future composite-FK or deferrability dependency. Wave 4 therefore
first proves that neither canonical key is an FK target, then reuses them
explicitly without converting, renaming, attaching, or dropping them.

## Production gate

The eleven pending constraints require a privileged read-only Production
evidence run that confirms exact prerequisite columns, existing UNIQUE/PK and
index inventory, duplicate group count, maximum duplicate group size, and
legacy-write compatibility. Only aggregate counts may leave the database.

No constraint is `SAFE_INSTALL_WITH_LOCAL_EVIDENCE`. A later wave may propose
DDL only after the Production aggregate is zero and the lock/build strategy is
approved object by object. Wave 4 performs no DDL and leaves the adoption
ledger at `canonical_objects` / order `4`.
