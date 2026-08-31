# Phase 1 Dependency Graph

## Bridge Dependencies

| Migration | Requires | Provides | Deliberately does not provide |
| --- | --- | --- | --- |
| `production_adoption_foundation` | reviewed installer with database ownership/CREATE; safe existing `reflab_rls_owner`; absent `reflab_meta`, `reflab_private`, Development RPCs, identity links, and schema-state infrastructure | locked schemas; empty canonical schema-state table; append-only adoption ledger; Phase 1 evidence | canonical marker row, identity mapping, runtime grants, business functions |
| `production_adoption_exam_training_prerequisites` | foundation transition; historical `attempts`/`exam_results`; institution FK targets; expected legacy column types | nullable Exam/Training source/session columns; closed `referee_exam_sessions`; legacy-safe checks/FKs/indexes | `canonical_payload_hash`, historical backfill, `attempts_exam_source_check`, `NOT NULL`, Exam/Training RPCs, service-role access |
| `production_adoption_psychology_notifications_prerequisites` | Exam/Training transition; three Psychology tables with known-or-null module slugs; notification events | exact deterministic module catalog; nullable deduplication and partial unique index | Psychology FKs/policy/trigger, Psychology rewrites, notification backfill, runtime grants |

## Executable Object Providers

| Object | Sole provider |
| --- | --- |
| `reflab_meta` and `reflab_private` schemas | `202608310001` |
| `reflab_meta.reflab_schema_state` table, reject function and immutable trigger, empty | `202608310001` |
| canonical `reflab_schema_state` installed row | future canonical finalization only |
| `production_adoption_state` table, monotonic guard and trigger | `202608310001` |
| `referee_exam_sessions`, its internal constraints, three institution FKs and two indexes | `202608310002` |
| nullable `exam_results.exam_session_id/payload_hash`, null-safe hash check, unique and session FK | `202608310002` |
| nullable attempts source tuple and institution assessment session, two null-safe checks, assessment FK and occurrence index | `202608310002` |
| `attempts.canonical_payload_hash` and its check | `202608130001` only |
| `attempts_exam_source_check` | future canonical Exam runtime cutover |
| exact `psychology_modules` table and eight canonical rows | `202608310003` |
| Psychology module FKs/read policy/updated-at trigger | future Psychology runtime/security cutover |
| nullable notification deduplication and partial unique index | `202608310003` |

## Existing Migration Dependencies

| Existing migration | Actual prerequisites | Production status |
| --- | --- | --- |
| `202608110001_canonical_admin_user_access` | canonical access table shapes; safe `reflab_rls_owner`; empty `reflab_schema_state` structure; reviewed admin policy/grant cutover | may install disabled functions after those prerequisites; its stale comment about `202608030001` is not a Production edge, and its RPCs remain fail-closed without an installed row |
| `202608130001_canonical_training_attempts` | source reference columns including `source_occurrence_id`; `institution_assessment_session_id`; canonical JSON helper; empty marker structure; access/institution tables; reviewed Training policy/grant cutover | remains sole provider of canonical payload hash and its check; may install disabled functions after all listed prerequisites |
| `202608150001_canonical_communication_feedback` | `202608130001`; existing source/hash columns; empty marker structure; reviewed Communication policy/grant cutover | may install disabled functions after prerequisites; runtime invocation remains blocked until final marker |
| `202608200001_canonical_coach_rate_limit` | canonical rate-limit table/unique key, ownership and grants | structurally independent of identity links, but blocked pending contract and security reconciliation |
| `202608210001_canonical_institution_invitation_acceptance` | complete institution tables/columns/FKs, canonical profile identity, exact constraints and execution grant | structurally independent of marker, but blocked pending data/grant audit |
| `202608240001_canonical_institution_catalog_alignment` | privileged catalog visibility; exact current role/permission usage audit; reviewed removals | blocked; must not run directly against the confirmed 38/12/117 catalog |

## Ordering

```text
Phase 0 evidence and restore rehearsal
  -> foundation/provenance + empty schema-state infrastructure
  -> Exam + Training compatibility
  -> Psychology + Notifications compatibility
  -> privileged semantic audit
  -> reviewed Admin branch (110001) and Training branch (130001 -> 150001)
  -> object-by-object RLS/grant/policy cutover
  -> runtime cutover
  -> canonical provenance finalization
  -> legacy cleanup
```

Timestamp order alone is never sufficient. Each edge is enforced by catalog and adoption-ledger preconditions.

The installed marker is a runtime enablement edge, not a DDL prerequisite for the three canonical incrementals above. The table may exist empty while their functions and policies are installed; the functions must continue to reject calls until canonical finalization inserts the single reviewed Production row.
