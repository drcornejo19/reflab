# Phase 4B Wave 5: CHECK and Foreign-Key Evidence

Wave 5 is evidence-only. It does not install, replace, drop, or validate constraints in Production.

The effective canonical contract is generated on PostgreSQL 18 from the physical canonical baseline followed, in order, by the six reviewed Production-safe canonical incrementals through `202608240001`. Production-adoption and Development-only migrations are excluded. The generated provider graph records every migration file hash and is itself hashed.

The baseline extractor now covers the physical catalog exactly: 300 CHECK constraints and 129 foreign keys, with zero missing or unexpected entries. The previous 297/61 result omitted three inline CHECKs preceded by comments and 68 additional `ADD CONSTRAINT` clauses in multi-constraint `ALTER TABLE` statements. The Training incremental then adds one CHECK, producing an effective total of 301 CHECK constraints and 129 foreign keys.

## Cardinality contract

Classification counts use effective canonical identities, not observed representations. A CHECK identity is `schema + table + canonical catalog constraint name`. An FK identity is `source schema + source table + canonical constraint name + ordered source columns + target schema/table + ordered target columns`. Wave 5 contains 301 unique CHECK keys and 129 unique FK keys, with zero collisions.

The three baseline CHECK identities missed by Phase 4A were `public.institutional_clips.institutional_clips_sport_type_check`, `public.institutions.institutions_plan_key_check`, and `public.user_profiles.user_profiles_subscription_plan_check`. The exact 68 recovered FK identities are exported as `PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS`; each is a real baseline identity omitted by the former single-clause `ALTER TABLE` extractor, not a variant or duplicate. This was a reporting bug: the baseline SQL source did not change.

`public.attempts.attempts_canonical_payload_hash_check`, provided by `202608130001_canonical_training_attempts.sql`, is the one genuinely new effective canonical identity beyond the 300 baseline CHECKs. `public.attempts.attempts_source_type_check` has two provider representations because `202608150001_canonical_communication_feedback.sql` evolves its expression, but remains one identity. The reviewed adoption expression for `public.exam_results.exam_results_payload_hash_check` and any equivalent historical constraint name are observed representations of an existing canonical identity and never increase canonical cardinality.

`public.attempts.attempts_source_type_check` is intentionally evolved by `202608150001_canonical_communication_feedback.sql`; its effective contract includes `communication_feedback`. All expressions, FK actions, match semantics, deferrability, validation state, and ordered columns come from the generated PostgreSQL catalog artifact rather than raw DDL rendering. A local zero violation/orphan count is only `LOCAL_DATA_VALIDATION_PASS`; it never authorizes Production installation.

Every CHECK and FK data audit carries explicit provenance. `SYNTHETIC_FIXTURE` can exercise expressions and joins but cannot establish Production compatibility, authorize installation, or require a backfill. `REVIEWED_HISTORICAL` and `PRIVILEGED_PRODUCTION` are authoritative only for their scoped aggregate evidence. Violations from either authoritative level remain blockers; present structural drift remains a blocker regardless of data provenance.

The Phase 2B fixture defines `public.notification_events.status` with a synthetic `pending` default. Git history, the canonical baseline, and current runtime writers instead support `queued`, `sent`, `failed`, and `skipped`, with no evidence that `pending` is equivalent to `queued`. Therefore the absent `notification_events_status_check` remains `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE`; the 60 synthetic `pending` rows neither abort Wave 5 nor authorize a backfill, a transitional state, or installation of the canonical CHECK.

`public.attempts.attempts_exam_source_check` is `CUTOVER_ONLY` because PostgreSQL enforces a `NOT VALID` CHECK on new writes and the reviewed legacy runtime may still write exam attempts without canonical source metadata. The complete local traversal classifies CHECK constraints as 33 `EXACT_CANONICAL`, 266 `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE`, one `LEGACY_REQUIRED_TEMPORARILY`, and one `CUTOVER_ONLY`. It classifies foreign keys as four `EXACT_CANONICAL`, one `EQUIVALENT_REUSE`, and 124 `REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE`. These local classifications do not authorize installation.

The read-only gate rejects same-name contract drift, duplicate FK providers, authoritative aggregate CHECK violations, authoritative aggregate FK orphans, missing tables, and a premature canonical marker. Synthetic aggregate violations are retained as non-authoritative observations and leave absent constraints blocked on privileged Production evidence. Objects whose referenced fixture columns are not modeled remain unknown rather than passing implicitly.

No Wave 5 installation migration exists. The adoption ledger remains `canonical_objects` / order `4`, `reflab_schema_state` remains empty, and runtime cutover is out of scope.
