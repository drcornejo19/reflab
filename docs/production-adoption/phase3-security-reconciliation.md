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
attestation integrates `phase3-core-policy-production-baseline.mjs`, version 1,
as the independently adjudicated transition snapshot. Before querying Production,
the runner requires its pinned committed Git blob, canonical semantic digest,
corrected migration hash and shared-contract compatibility in a clean approved
HEAD. No temporary forensic file or arbitrary observed inventory can self-approve.
The snapshot freezes 301 table ACL and 20 column ACL entries for preservation
only: `TABLE_ACL_SECURITY_STATUS = PENDING_RECONCILIATION`, not final canonical
security approval. The disposable rehearsal verifies structural parity but its
local catalog OIDs and synthetic aggregate hashes never approve Production.
Implementation changes still require commit and remote-readiness review; no
Production attestation or DDL is authorized by the local rehearsal.

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
| Historical browser writes | observed all-eight grants | retired on attempts/exam/rules and profile table | server/RPC paths; profile column contract |
| Unexpected routine EXECUTE | not globally reconciled | unchanged except helper hardening | privileged routine inventory |

This is not a claim that the historical Production blocker totals are zero. Triggers, indexes, remaining functions, institution policies, Storage, semantic sidecar teardown, runtime cutover, and canonical marker remain open.

## Go/no-go gates

### Corrected 64249 browser-only boundary

The transition baseline freezes the completed 13-table Production forensic as
`OBSERVED_PRODUCTION_PRE_INPUT`, adjudicated for this transition only. It does not
overwrite the historical 64245 baseline or approve broad service-role authority.
The eight-privilege PostgreSQL 17 matrix includes MAINTAIN. All anon grants are
removed; authenticated keeps SELECT on all 13 tables and INSERT/UPDATE on the
five owned match/psychology tables. Profiles retain table SELECT plus exactly
20 INSERT and 19 UPDATE column grants (no user_id UPDATE). Historical exam and
training INSERT policies are preserved definitions, but no longer authorize
browser INSERT because the table privilege is absent.

`referee_exam_sessions` intentionally receives only the authenticated SELECT
ACL. Its authenticated SELECT policy is absent at this boundary; RLS therefore
denies browser rows. This is NOT full browser capability readiness. No policy is
created, changed or dropped by 64249. All 55 policies, non-browser table/column
grants, table owners, RLS/FORCE, 64236 functions and adoption state are preserved.

The dedicated classifier distinguishes executable observed PRE, already-installed
POST and BLOCKER; installed POST never invokes the migration again. Production
classification pins the observed aggregate digests. The disposable PG17 harness
uses the exact observed catalog and ACL topology, but synthetic row data and local
OID-dependent digests, explicitly marked `LOCAL_SYNTHETIC_DATA_ONLY`. It is not a
new Production attestation. The unchanged mechanical forensic fixture remains
mechanical only, independent of this transition fixture.

Service-role reconciliation, infrastructure cleanup and TRUNCATE/TRIGGER/
REFERENCES/MAINTAIN review for other roles remain separate. Global ACL security
is incomplete; runtime remains blocked by the final privilege wave. 64253 still
requires independent review. No remote authorization is granted by local tests.

### Dedicated 64249 READ ONLY PRE attestation

`npm.cmd run attest:production-browser-privilege-pre` uses the dedicated
`--production-browser-privilege-pre-attestation` operation. It requires only
`ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT`,
`ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION`, and
`ALLOW_PRODUCTION_BROWSER_PRIVILEGE_PRE_ATTESTATION`, each exactly `true`, plus
the privileged read-only project ref, approved HEAD and DB URL variables. The
gate rejects dirty/staged/untracked state, all inherited PG variables, unrelated
Production opt-ins and DDL configuration. It verifies committed Git blob hashes
and normalized checkout equality for the migration, baseline, classifier,
shared security matrix, observation code and hardened output serializer.

The runner collects current evidence in one bounded `BEGIN READ ONLY`
transaction, verifies `transaction_read_only = on`, and ends with `ROLLBACK`.
Lock/statement timeouts are 2s/15s. A database error closes the single psql
session, rolling back its read-only transaction; no retry or second connection
is made. The historical forensic TXT is never a runtime input. The exact
Session Pooler, project, database, SSL mode and managed postgres installer are
required. No migration is loaded for execution and no DDL is authorized.

The output distinguishes executable PRE, already-installed POST and BLOCKER.
PRE-only and POST-only checks expose their applicability explicitly, so exact
installed POST is non-executable rather than a failed PRE approval. Structured
values are validated before JSON serialization; unsafe payloads are discarded,
including credential-bearing errors. Service-role reconciliation, infrastructure
cleanup, 64253 review and runtime/cutover remain independent blocked boundaries.
Remote PRE execution still requires a separate committed-candidate review.

### Dedicated 64249 one-shot DDL runner (local implementation only)

`npm.cmd run execute:production-browser-privilege-64249` selects only
`--execute-production-browser-privilege-64249`. It requires exactly
`ALLOW_PRODUCTION_DDL=true`, `ALLOW_PRODUCTION_BROWSER_PRIVILEGE_64249_DDL=true`,
and `REFLAB_PRODUCTION_DDL_PROJECT_REF`, `REFLAB_PRODUCTION_DDL_APPROVED_HEAD`,
`REFLAB_PRODUCTION_DDL_DB_URL`. Read-only opt-ins are not substitutes. Foreign
Production authorization, inherited PG variables, dirty/staged/untracked state,
wrong HEAD, target or committed artifact hashes fail before connection.

One persistent psql session owns BEGIN, live PRE, the exact committed migration
body, live POST and COMMIT. The SHA-verified outer BEGIN/COMMIT alone are removed
in memory; the committed migration is never regenerated or rewritten. Explicit
ordered table locks serialize the observed ACL transition. Local transaction
bounds are 5s lock, 60s statement, 180s transaction and 15s idle-in-transaction;
the existing bounded session transport is reused without modification.

The execution-only adapter changes the transport applicability, not catalog
evidence or the protected read-only runner. It reports a writable transaction
explicitly, requires the live `transaction_read_only=off` guard and every
unchanged catalog check. POST is verified before COMMIT. Failures roll back;
installed POST refuses reexecution with zero migration calls. Loss of COMMIT
acknowledgement is UNKNOWN, never automatically replayed: the only permitted
next diagnostic is a separately authorized READ ONLY post-state forensic.

The current externally reported PRE is CURRENTLY_ATTESTED_EXECUTABLE_EXACT;
no second external PRE is needed merely to implement/review this runner. That
evidence is not hardcoded as live state and does not authorize remote DDL here.
Structured secret checks occur before serialization, including DDL credentials.
The PG17 rehearsal uses observed catalog definitions with synthetic row data,
never Production fingerprints. Browser-only success still leaves service-role
reconciliation, infrastructure cleanup, 64253 review and runtime/cutover blocked.

### Service-role privilege forensic (local implementation only)

`npm.cmd run forensic:production-service-role-privileges` selects only
`--production-service-role-privilege-forensic`. It requires exactly `true` for
`ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT`,
`ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION`, and
`ALLOW_PRODUCTION_SERVICE_ROLE_PRIVILEGE_FORENSIC`, together with
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF`,
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD`, and
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL`. Foreign Production opt-ins,
DDL configuration, inherited PG variables, wrong target/HEAD, or any dirty,
staged or untracked file reject execution before connection. Committed and
checkout artifact pins cover the protected browser lineage and reused security
transport. Implementation and fixture results grant no remote authorization.

One `BEGIN READ ONLY` verifies `transaction_read_only=on`, applies transaction-local
2s lock and 15s statement bounds, and always ends with `ROLLBACK`; errors close
the single session without retry. It does not execute migrations, approve a
baseline, or mutate any database object. Structured secret validation precedes
serialization; unsafe payloads, including driver messages, are discarded.

The primary thirteen tables remain distinct from the explicitly enumerated
57 additional runtime objects. Missing additional objects are reported absent,
not substituted with expected state. Institutional invitations use membership,
membership-role and group-membership tables; institutional exams use assessment,
assignment/session and referee-session tables. The four DELETE caller tables
and coach rate-limit bucket have dedicated evidence sections. None of the
additional objects is authorized to enter a privilege-mutation wave.

All eight PG17 privileges, including MAINTAIN, are observed as raw ACL entries
and effective service-role privileges separately. Every effective path must be
explainable by direct grants, PUBLIC, ownership ACLs, inherited grants, implicit
database ownership, PG17 predefined read/write/maintenance roles or superuser
status. The full membership graph records edge
direction, grantor and PG17 INHERIT/SET options; SET ROLE reachability is not
treated as automatically inherited authority. Role attributes and FORCE/RLS
determine the reported row-security path, rather than Supabase conventions.
Column ACLs and table-derived effective column capabilities remain separate.

Relevant RPC overloads report source hashes, owner, language, security mode,
configuration and EXECUTE provenance. SECURITY DEFINER access executes as its
observed owner; invoker access executes as the caller. Absent RPCs are explicit.
This evidence is not a transitive static proof of arbitrary function bodies.
The protected function/schema fingerprint independently rejects any drift from
the completed browser lineage. All 55 policies use literal-sensitive comparison;
64236, 64245, 64249 POST, adoption boundaries and Production data fingerprints
remain independently pinned.

Current-versus-design deltas are computed from actual effective entries. The
proposed thirteen-table matrix is design input only. The carried-forward local
fixture yields 70 revocation entries and 3 grant entries; these are not assumed
Production truth or SQL statement counts. No executable authorization is emitted:
`approval=NOT_PERFORMED`, `mutationCount=0`.

The PG17 fixture is `LOCAL_MECHANICAL_FIXTURE_ONLY`, with separately labelled
synthetic data and RPC stubs. Its setup/variant DDL and DML is disposable local
test infrastructure, expressly authorized by the user, never collector behavior
or a migration execution. Production comparisons cannot accept the local
historical proof adapter. Browser reconciliation is complete by carried-forward
execution evidence; global table ACL reconciliation remains incomplete. The
service-role wave, infrastructure lifecycle, independent 64253 review, Phase4,
runtime and cutover remain unauthorized.

Phase 3 is locally acceptable only when static tests, disposable PostgreSQL rehearsal, attacks, rollback cases, historical fingerprints, marker/ledger assertions, and the full preceding adoption battery pass. Production execution requires separately reviewed authorization and an exact live PRE inside the one-shot transaction.
