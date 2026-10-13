# Additional-Runtime Production Harness: Local Engineering Only

No remote PRE, DDL, generic migration push, pending-migration enumeration,
Phase4 provider, 64253, runtime enablement, or cutover is authorized. The next
step is to commit and review this harness, then separately authorize one
READ-ONLY external PRE. PRE success never grants write authorization.

The immutable current target is 332 privilege-entry revocations, zero grants,
124 unchanged cells, and 57 explicit REVOKE statements. The exact migration
SHA-256 is `b83e0c286de1f3bff4318b0df6893255ca57e0fe443de6a4a59f2838f871b4ba`.
Its body is extracted from committed bytes by verified structural BEGIN/COMMIT
spans only. The source builder is used for parity verification, never as the
executed SQL authority. No live catalog drives mutation scope.

Commands (not authorized for remote use yet):

```text
npm.cmd run preflight:production-additional-runtime-service-role
npm.cmd run execute:production-additional-runtime-service-role-reconciliation
```

PRE requires exactly the three opt-ins
`ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT=true`,
`ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION=true`, and
`ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_SERVICE_ROLE_PRE=true`, plus
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF`,
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD`, and
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL`.

DDL requires `ALLOW_PRODUCTION_DDL=true` and
`ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_SERVICE_ROLE_DDL=true`, plus
`REFLAB_PRODUCTION_DDL_PROJECT_REF`, `REFLAB_PRODUCTION_DDL_APPROVED_HEAD`,
`REFLAB_PRODUCTION_DDL_DB_URL`, and `REFLAB_PRODUCTION_DDL_MIGRATION_SHA`.
The last value must equal the exact migration hash above. Opposite/foreign
Production configuration and inherited PG or Node execution overrides fail
closed even when their values are false.

Target: project `nagjddldrldwavmfaytc`, host
`aws-1-sa-east-1.pooler.supabase.com`, port 5432, database `postgres`,
sslmode=require, installer `postgres.nagjddldrldwavmfaytc`. No fallback exists.

Before constructing a session, both runners verify approved HEAD equality,
clean/staged/untracked state, pinned protected artifacts, the complete relative
static-import closure, canonical baseline data and package bytes, and exact
executing-runner bytes against its approved Git blob. New harness files are
pinned by approved HEAD, avoiding self-referential hashes. Structured metadata
also passes credential protection before connection; output/errors are checked
again before serialization. Unsafe output fails closed rather than leaking.

PRE owns one BEGIN READ ONLY, verifies transaction_read_only=on, and always
ROLLBACKs. It has 2s lock, 15s statement, 15s idle-in-transaction, and 180s
transaction bounds. It never has a migration execution path.

DDL owns one persistent connection/transaction: BEGIN, bounded local timeouts,
sorted locks on exactly 57 tables, live exact PRE, verified body once, live exact
POST, preservation/delta verification, COMMIT. Bounds are 5s lock, 60s statement,
15s idle, 180s transaction; the shared transport has a 190s lifetime watchdog.
Failures before COMMIT roll back; acknowledged COMMIT reports COMMITTED_POST_EXACT.
Every unacknowledged COMMIT is UNKNOWN_COMMIT_OUTCOME, never claimed rolled back.
Automatic retries/replay are forbidden; only separately authorized read-only
post-state forensic observation may inform a subsequent manual decision.
Exact installed POST refuses reexecution with zero migration invocation; a
partial/hybrid state is BLOCKER, never repaired by inferred delta.

The completed primary thirteen-table wave remains closed and immutable. Browser
ACLs/columns and policies are preservation-only; browser reconciliation is
separate and the lead-submission authorization issue is not repaired here.
Coach buckets retain no current service-role TABLE grants. Future SELECT/INSERT/
UPDATE belong only to the separately reviewed canonical INVOKER cutover provider.
All four current direct DELETE requirements remain protected. Current functions
and EXECUTE ACLs are unchanged; invitation/exam future providers are not installed.
Global ACL reconciliation remains incomplete, 64253 is separate, Phase4 is
unexecuted, runtime remains disabled, cutover is unexecuted, and current runtime
usability is unestablished.

Validation keeps 2741 frozen tests, 157 completed-primary harness tests, and 1058
additional reconciliation tests distinct (3956 protected total). New harness
tests use a separate `.spec.mjs` inventory entry, with no duplicate-counting.
Disposable PG17 rehearsals and their delta reports are explicitly
SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH. No local fixture proof is accepted
by the Production classifier.

Reproducible LOCAL validation commands (distinct test-file inventories):

```text
node scripts/production-adoption/phase3/run-current-service-role-static-regression.mjs
node --test scripts/production-adoption/phase3/phase3-current-service-role-harness.spec.mjs
node --test scripts/production-adoption/phase3/phase3-additional-runtime-service-role.spec.mjs
npm.cmd run test:additional-runtime:harness
npm.cmd run test:additional-runtime:pre:postgres
npm.cmd run test:additional-runtime:ddl:postgres
```

The new static harness inventory is 371 cases (4327 unique static cases total).
The dedicated local PRE rehearsal has 26 cases. The dedicated DDL rehearsal has
75 exact-PRE rollback cases, acknowledged/persisted POST, second-invocation
refusal, and three commit-outcome categories. Existing PG17 regressions remain
separate, including the approved 204-negative/76-rollback additional migration
rehearsal. Synthetic results do not establish current Production state.
