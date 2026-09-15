# Psychology module reconciliation evidence

This evidence contract is read-only and precedes `202608310003`. It does not
replay `202606240001`, add columns, backfill rows, or authorize cutover.

## Historical mappings

| Table | Source | Reviewed historical mapping | Historical shape |
| --- | --- | --- | --- |
| `public.psychology_checkins` | `checkin_type` | `error_recovery -> gestion-error`; `post_match -> evaluacion-post-partido`; otherwise `preparacion-mental-pre-partido` | `CASE`; the original source vocabulary is `pre_match`, `post_match`, `error_recovery` |
| `public.psychology_wellbeing_assessments` | none | every row -> `resiliencia` | fixed literal |
| `public.psychology_exercise_sessions` | `exercise_type` | `pressure_scenario -> presion-competitiva`; `self_talk -> confianza-arbitral`; `team_prebrief -> preparacion-mental-pre-partido`; otherwise `concentracion-foco` | `CASE`; the original source vocabulary is `focus_reset`, `pressure_scenario`, `self_talk`, `team_prebrief` |

Before `module_slug`, the reviewed table column inventories were:

- `psychology_checkins`: `id`, `user_id`, `checkin_type`, `match_context`,
  `pressure_source`, `focus_goal`, `reset_cue`, `incident_minute`,
  `incident_summary`, `error_factors`, `learning`, `next_action`, nine score
  fields (`activation_score`, `confidence_score`, `pressure_score`,
  `concentration_score`, `emotional_control_score`, `mental_fatigue_score`,
  `error_impact_score`, `recovery_score`, `process_orientation_score`),
  `mental_score`, `mental_status`, `feedback`, `responses`,
  `source_documents`, `created_at`, and `updated_at`.
- `psychology_wellbeing_assessments`: `id`, `user_id`, `week_start`,
  `week_context`, `emotional_exhaustion_score`, `cynicism_score`,
  `motivation_score`, `sleep_disruption_score`,
  `concentration_difficulty_score`, `external_pressure_score`,
  `institutional_support_score`, `violence_exposure_score`,
  `recovery_quality_score`, `workload_score`, `burnout_risk_score`,
  `burnout_risk_level`, `stressors`, `protective_factors`, `feedback`, `notes`,
  `source_documents`, `created_at`, and `updated_at`.
- `psychology_exercise_sessions`: `id`, `user_id`, `exercise_type`,
  `scenario_id`, `scenario_title`, `pressure_level`, `before_score`,
  `after_score`, `clarity_score`, `response_strategy`, `internal_dialogue_before`,
  `internal_dialogue_after`,
  `communication_phrase`, `action_plan`, `feedback`, `notes`,
  `source_documents`, `created_at`, and `updated_at`.

The historical provider adds nullable `module_slug` columns, updates product
rows, and creates indexes. It is not safe to replay blindly on an evolved
database. The evidence contract treats null or out-of-vocabulary source values
as unmapped rather than silently accepting the historical `ELSE` branches.

The canonical final baseline makes all three columns `NOT NULL` and introduces
foreign keys to `public.psychology_modules(slug)`. Those foreign keys are not
installed by `310003`.

## Canonical catalog

The eight slugs created by `310003` are:

`gestion-error`, `presion-competitiva`, `concentracion-foco`,
`confianza-arbitral`, `resiliencia`, `preparacion-mental-pre-partido`,
`evaluacion-post-partido`, and `sin-clasificar`.

## Evidence and options

The fixed catalog query verifies the three tables, the two mapping source
columns, complete row visibility, and the exact absence of all three
`module_slug` columns. The aggregate query returns only row counts, approved
source-category counts, mapped-slug counts, and unmapped/ambiguous/null counts.

- Option A, nullable columns only: requires exact absence, compatible source
  schema, and a separate review proving nullable columns do not activate or
  break current runtime writes.
- Option B, nullable columns plus deterministic backfill: additionally requires
  `DETERMINISTIC_COMPLETE` Production evidence for every non-empty table and a
  separately reviewed data-mutation migration.
- Option C, manual/business mapping: required for any unmapped or ambiguous row.
- Option D, block reconciliation: required for incomplete visibility, missing
  source columns, partial target state, unsafe output, or unresolved data.

Synthetic rehearsal results never authorize a Production backfill. If the
normal preflight role cannot prove complete visibility because of RLS, the
runner returns `PRIVILEGED_READ_ONLY_REQUIRED`; it does not weaken RLS.
