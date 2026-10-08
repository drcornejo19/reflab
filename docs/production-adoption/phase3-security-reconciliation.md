# Phase 3 Production Security Reconciliation

## Status and scope

Phase 3 is a local, reviewed **PRE-CUTOVER SECURITY** bridge. It follows Phase 1, the temporary Phase 2A semantic audit sidecar, and Phase 2B canonical runtime installation. It does not connect to Production, activate runtime, advance the adoption ledger, or finalize the canonical marker. The schema state remains empty.

The machine-readable source of truth is `scripts/production-adoption/phase3/phase3-security-contract.mjs`. It records every selected policy and browser privilege by object, role, privilege, expected contract, caller, decision, and phase. UNKNOWN is never removal evidence.

## Threat model

The bridge prevents five concrete failure modes:

1. Browser roles retaining destructive `DELETE`, `TRUNCATE`, `REFERENCES`, or `TRIGGER` privileges inherited from historical/default ACLs.
2. RLS policies continuing to read Clerk/JWT claims through legacy public helpers.
3. `PUBLIC` or `anon` invoking privileged helpers or `SECURITY DEFINER` functions.
4. A migration silently reconciling a policy, ACL, role, or RLS state that differs from the reviewed fixture.
5. Canonical RPCs becoming active before the final marker and runtime cutover.

The migrations fail closed on a premature marker, Development identity objects, unsafe helper-role attributes, unexpected role membership, missing dependencies, disabled RLS, policy expression drift, and PUBLIC/column ACL drift.

## Normalized inventory

| Classification | Phase 3 interpretation |
| --- | --- |
| `canonical_missing` | Exact canonical object/access still absent and safe to add. |
| `canonical_contract_drift` | Existing object is recognized but its complete contract differs. |
| `legacy_required_temporarily` | A proven caller still needs the access before runtime cutover. |
| `legacy_safe_to_remove` | Explicitly reviewed access with no current caller and no canonical purpose. |
| `development_forbidden` | Development identity RPC/table; must remain absent. |
| `adoption_temporary` | Phase 2A audit infrastructure retained until final audit teardown. |
| `unknown_requires_evidence` | No mutation is allowed until privileged evidence resolves it. |

## Domain rollout

| Domain | Tables/objects in this batch | Browser contract | Decision |
| --- | --- | --- | --- |
| Identity / profiles | `user_profiles`, canonical/private and three public wrapper helpers | Own read/write; broad profile writes retained temporarily | Independent pre-cutover |
| Admin | `user_global_roles`, `user_subscriptions` | Authenticated read only; RPC writes stay marker-disabled | Partial pre-cutover |
| Training | `attempts` | Own read; legacy browser INSERT retained | Dual runtime |
| Exams | `exam_results`, `rules_exam_results`, `referee_exam_sessions` | Own read; historical result INSERTs retained where proven | Dual runtime |
| Institutions | No broad institution policy/grant batch | Unresolved | `unknown_requires_evidence` |
| Matches | `match_preparations`, `post_match_reviews` | Canonical owned SELECT/INSERT/UPDATE | Independent pre-cutover |
| Psychology | Three owned activity tables | Canonical owned SELECT/INSERT/UPDATE | Independent pre-cutover |
| Notifications | `notification_events` | Authenticated own read; server write | Read-only pre-cutover |
| Storage | No mutation | Existing bucket/policy evidence requires separate reconciliation | `unknown_requires_evidence` |
| Metadata | Empty schema marker, Phase 4 ledger, audit sidecar | No application access | `adoption_temporary` |

## Policy reconciliation matrix

The reviewed batch contains 22 canonical policies:

- `user_profiles`: own read, insert, update.
- `match_preparations` and `post_match_reviews`: own read, insert, update.
- `psychology_checkins`, `psychology_wellbeing_assessments`, and `psychology_exercise_sessions`: own read, insert, update.
- `attempts`, `exam_results`, `rules_exam_results`, and `notification_events`: own read only.

Existing targeted policies may be absent or match a recognized legacy equivalent using `platform_request_user_id()` and `platform_is_super_admin()` (qualified or unqualified), or the canonical private helpers. `institution_*` expressions are not normalized by this migration. Any different command, role set, permissive mode, `USING`, or `WITH CHECK` aborts. Replacement occurs in one transaction and points directly to `reflab_private.request_user_id()` and `reflab_private.is_super_admin()`.

Institution policies are intentionally excluded. Their helper graph and permission catalog need a separate exact caller/policy inventory before replacement.

### Reviewed 64245 historical Production input

The completed baseline forensic observed four historical target SELECT policies
(`user_profiles`, `attempts`, `exam_results`, `rules_exam_results`), eighteen missing
target slots, and twenty-three non-target policies. The corrected, unexecuted
64245 validates and retires exactly three direct-auth legacy policies in the same
transaction: `Users can read own notification events`,
`match_preparations_authenticated_manage_own`, and
`post_match_reviews_authenticated_manage_own`. Missing or altered retirement
inputs abort before any policy mutation. Catalog expressions preserve literal
case and casts; raw CREATE statement formatting is not an approval boundary.

The canonical matrix remains 22 policies, with no authenticated DELETE policy.
The local caller audit found server/service-role UPSERT/read paths, cancellation
by appointment UPDATE, and no authenticated DELETE dependency. The three service
policies, three historical insert policies, ten audit-owner policies, and four
admin/training support policies remain unchanged (20 total). POST rejects any
surviving legacy direct-auth browser path or authenticated DELETE/ALL policy on
the two match tables. Exact observed mutation accounting is seven policy drops
(four replacements plus three retirements) and twenty-two creates; no product DML.

Table/column ACLs, owners, RLS/FORCE, 64236, adoption boundaries and fingerprints
are preservation invariants, not cleanup targets. ACL reconciliation remains a
separate mandatory pre-runtime boundary, including MAINTAIN, TRUNCATE, TRIGGER
and REFERENCES review. This does not authorize a later provider or Production.
The historical forensic report remains immutable and observation-only. The PRE
attestation still needs a separately committed/reviewed Production baseline;
the local rehearsal inventory must never approve Production by observation.

## Identity helper migration

`reflab_private.request_user_id()` remains the canonical Clerk-subject boundary defined by the current baseline. `user_*` values are not rewritten and `user_identity_links` is never created.

The three legacy public helpers are replaced with `SECURITY INVOKER`, `search_path = pg_catalog` wrappers over that boundary:

- `public.institution_request_user_id()` has historical institution function and policy callers.
- `public.platform_request_user_id()` has historical access and core RLS callers.
- `public.reflab_request_user_id()` is Production-only and remains until privileged evidence proves its caller graph.

They retain `authenticated` and `service_role` execution temporarily. `PUBLIC` and `anon` execution is revoked. Their final DROP belongs to **POST-CUTOVER CLEANUP** after a zero-caller proof.

The reviewed source contract is the SHA-256 of `pg_proc.prosrc` after removing ASCII/POSIX whitespace only from both outer edges. Whitespace inside the function body remains byte-significant and therefore changes the hash. JavaScript contract generation and PostgreSQL preconditions use the same rule.

## Browser grant reconciliation

The browser matrix covers `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` for `anon` and `authenticated` on 13 explicit tables.

- `anon` loses every reviewed table privilege.
- `authenticated` loses `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` on every reviewed table.
- `user_global_roles`, `user_subscriptions`, `referee_exam_sessions`, and `notification_events` become authenticated read-only.
- `attempts`, `exam_results`, and `rules_exam_results` retain INSERT only as a proven dual-runtime dependency.
- `user_profiles` retains broad INSERT/UPDATE temporarily; final canonical cutover must replace these with the baseline column grants.
- Matches and Psychology owned tables retain canonical SELECT/INSERT/UPDATE.

There is no `REVOKE ... ON ALL TABLES`, `GRANT ALL`, or `ALTER DEFAULT PRIVILEGES`. Service-role grants are snapshotted by the rehearsal and must remain unchanged by this batch.

## Routine EXECUTE caller report

The application has seven canonical server callers: Admin plan/role, Training attempts, Communication feedback, referee exam, Coach rate limit, and institution invitation acceptance. Their expected executor is `service_role`; none is revoked by Phase 3.

Development linker RPCs remain forbidden. Internal helpers keep explicit least-privilege execution. Remaining historical routine EXECUTE findings stay open until the full privileged routine inventory is mapped to TypeScript, JavaScript, SQL, API routes, and server actions.

## Three-stage lifecycle

### PRE-CUTOVER SECURITY

Apply the three proposed migrations after Phase 2B. Legacy writes and public helper wrappers with proven callers remain. Canonical RPCs stay fail-closed because schema state remains empty. The semantic audit sidecar remains installed and isolated.

### CUTOVER SECURITY

After the deployed runtime uses only canonical server RPCs, remove temporary browser INSERTs and broad profile writes, install the remaining reviewed policy/grant domains, reconcile service-role/table/function privileges, and only then record ledger phase `security_cutover`.

### POST-CUTOVER CLEANUP

After privileged zero-caller evidence, revoke and remove legacy identity helpers. Tear down the semantic audit sidecar only at its documented lifecycle gate. Remove any temporary policies/grants and reconcile the final object inventory before runtime activation and canonical finalization.

## Rollback

Each migration is one transaction with a five-second lock timeout, a conservative statement timeout, exact catalog preconditions, post-change assertions, and no data mutation. Any mismatch aborts and rolls back the whole migration. No canonical marker or ledger transition is part of this batch, so rollback cannot falsely advertise installation.

## Local blocker delta

| Family | Before reviewed batch | After local rehearsal | Still open |
| --- | ---: | ---: | --- |
| Direct external identity readers | 3 legacy helpers | 0 direct reads; 3 wrappers retained | wrapper teardown proof |
| Reviewed policy drift/missing | 22 selected policies | 0 selected drift | all unselected canonical policies |
| Reviewed anon grants | explicit broad fixture access | 0 | global browser grant inventory |
| Reviewed destructive authenticated grants | 13-table fixture access | 0 | unselected tables |
| Temporary browser writes | historical fixture access | 9 reviewed grants | runtime cutover |
| Unexpected routine EXECUTE | not globally reconciled | unchanged except helper hardening | privileged routine inventory |

This is not a claim that the historical Production blocker totals are zero. Triggers, indexes, remaining functions, institution policies, Storage, semantic sidecar teardown, runtime cutover, and canonical marker remain open.

## Go/no-go gates

Phase 3 is locally acceptable only when static tests, disposable PostgreSQL rehearsal, attacks, rollback cases, historical fingerprints, marker/ledger assertions, and the full preceding adoption battery pass. Production execution still requires a fresh privileged read-only fingerprint whose object-level state matches these preconditions exactly.
