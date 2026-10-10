# Current-installed service-role reconciliation candidate

Local candidate only. No Production PRE or DDL execution is authorized.

The completed service-role forensic at HEAD
`95a8809ce1db3b088f4bd13beace04182217e700` and subsequent semantic
adjudication supply the current execution identities and ACL topology.
Observation completion did not itself approve a transition.

The new, unused CLI-generated migration version `20261010041511` is later
than every existing version (including `20260925150422`). It does not
renumber completed migrations or overwrite the reserved `64253` provider.
Timestamp order is not execution authorization: do not replay earlier,
unexecuted Phase4 migrations or use a generic migration-push path.
The preflight migration inventory receives only this new version entry;
all prior entries, classifications, commands, and execution gates remain
unchanged. This addition is required by its complete local-file inventory
regression and grants no execution authorization.

Scope: only service_role table ACLs on the thirteen primary tables.
PostgreSQL 17 SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
and MAINTAIN are independently modeled in raw and effective state.
The matrix derives 96 PRE grants, 26 POST grants, 78 POST absences,
72 privilege-entry revocations, two privilege-entry grants, and 30
unchanged cells. Explicit SQL groups these as twelve REVOKE statements
and two GRANT statements. The latter are SELECT and INSERT on
referee_exam_sessions, never UPDATE.

The historical thirteen-argument exam RPC executes as postgres DEFINER;
training, communication, and admin RPCs execute as reflab_rls_owner
DEFINER. Function source hashes and expanded EXECUTE ACLs are pinned in
the external transition classifier using the supplied real forensic.
SQL asserts signatures, modes, owners, EXECUTE and predecessor catalogs,
and requires function sources and all protected catalog fingerprints to
remain unchanged across its transaction. SQL alone is not the external
exact Production fingerprint attestation or a DDL authorization.

The completed 64249 classifier predates this service-only transition.
Its preservation projection restores only its historical service ACL
expectation in an in-memory copy; original raw/effective service ACLs
are independently validated against the new PRE/POST matrix. Browser
ACLs, profile column grants, all 55 policies, identity, historical data,
adoption, and disabled runtime/cutover/Phase4 boundaries stay exact.
Additional runtime catalog fingerprints are compared before/after;
the 57 additional objects do not enter the mutation scope.

Local tests:

```powershell
node --test scripts/production-adoption/phase3/phase3-current-service-role.test.mjs
node scripts/production-adoption/phase3/run-current-service-role-postgres.mjs
```

Disposable fixture rows and RPC bodies are synthetic. The separate local
classifier requires explicitly labeled synthetic historical/source-hash
proof; the Production classifier cannot consume those overrides.
The rehearsal executes the exact candidate SQL bytes, proves refusal of
installed POST, and tests partial transitions and transaction rollback.

Future CUTOVER_ONLY provider responsibility, not implemented here:
add service_role INSERT on attempts, INSERT on exam_results, and UPDATE
on referee_exam_sessions before activating the canonical five-argument
INVOKER exam RPC. The future observed-PRE-to-target delta is 70/3, not
this candidate's 72/2. No implemented incremental exam provider currently
performs that installation. Canonical coach/invitation INVOKER privileges
are separate additional-runtime dependencies, not this mutation wave.

CURRENT_RUNTIME_USABILITY_NOT_ESTABLISHED: repository callers reference
the canonical five-argument overload, whereas the supplied forensic
observed only the historical overload. Runtime and cutover remain
unauthorized. Global table ACL reconciliation remains incomplete.
64253_INDEPENDENT_REVIEW_REQUIRED = YES.

## Dedicated Production Harness (Local Engineering Only)

Neither remote PRE nor DDL is authorized. Commit and independently review
this harness first, then separately authorize one external READ-ONLY PRE.
Only after that evidence is reviewed may a future isolated DDL execution
be considered. Successful PRE is not DDL authorization.

Commands reserved for future authorization:

```powershell
npm.cmd run preflight:production-current-service-role
npm.cmd run execute:production-current-service-role-reconciliation
```

Operations are `--production-current-service-role-pre-attestation` and
`--execute-production-current-service-role-reconciliation`, respectively.
PRE requires exactly these Production variables:

```text
ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT=true
ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION=true
ALLOW_PRODUCTION_CURRENT_SERVICE_ROLE_PRE=true
REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF
REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD
REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL
```

DDL requires its distinct variables (read-only flags cannot substitute):

```text
ALLOW_PRODUCTION_DDL=true
ALLOW_PRODUCTION_CURRENT_SERVICE_ROLE_DDL=true
REFLAB_PRODUCTION_DDL_PROJECT_REF
REFLAB_PRODUCTION_DDL_APPROVED_HEAD
REFLAB_PRODUCTION_DDL_DB_URL
REFLAB_PRODUCTION_DDL_MIGRATION_SHA=f4634ee7b18643d3672cf6767ebe8b5085e13b2e66dd5cd813c4d6b92e601fa0
```

The only target is project `nagjddldrldwavmfaytc`, Session Pooler
`aws-1-sa-east-1.pooler.supabase.com:5432`, database `postgres`,
`sslmode=require`, installer `postgres.nagjddldrldwavmfaytc`.
Foreign Production opt-ins and all inherited PG connection overrides fail
before connection. Exact approved HEAD, a clean worktree, fixed hashes of
approved transition artifacts, and approved-HEAD bytes for the complete
static import closure are mandatory. Executing runner bytes are hashed
against their committed Git blob, with no self-referential embedded hash.
Uncommitted harnesses cannot pass these Production gates.

PRE uses one `BEGIN READ ONLY`, verifies read-only mode, sets LOCAL
lock/statement/idle/transaction timeouts to 2s/15s/15s/180s and always
ROLLBACKs. It observes only and invokes no migration. DDL uses one
persistent connection, one transaction, deterministic primary-table locks,
and LOCAL 5s/60s/15s/180s timeouts. Live exact PRE precedes exactly one
invocation of the verified committed body; live exact POST and protected
catalog equality precede COMMIT. Structural extraction removes only the
two verified outer transaction statements, preserving all remaining bytes.
Installed POST refuses replay; partial transitions fail closed.

Pre-COMMIT failures roll back. Unacknowledged COMMIT returns
`UNKNOWN_COMMIT_OUTCOME`, forbids automatic retry, never claims rollback,
and requires a separately authorized read-only post forensic. Structured
output is checked for secrets before serialization; contaminated payloads
are discarded rather than reported as successful evidence.

The approved 2741-test inventory remains frozen and byte-unchanged.
New harness tests deliberately use `.spec.mjs` and an explicit separate
command, not the historical `.test.mjs` discovery namespace. Execute both
commands; never substitute the new suite for the frozen baseline:

```powershell
node scripts/production-adoption/phase3/run-current-service-role-static-regression.mjs
node --test scripts/production-adoption/phase3/phase3-current-service-role-harness.spec.mjs
node scripts/production-adoption/phase3/run-current-service-role-pre-postgres.mjs
node scripts/production-adoption/phase3/run-current-service-role-ddl-postgres.mjs
```

Report frozen baseline 2741, new harness tests N, and unique total 2741+N
separately. Disposable PG17 evidence remains synthetic, never Production
truth. The migration still implements only 72/2 (12 REVOKE, 2 GRANT).
Future 70/3 cutover privileges are not implemented; generic Supabase push,
64253 execution, Phase4 execution, runtime enablement and cutover remain
forbidden. Current runtime usability is not established.
