# Institutional leads dedicated Production runner

Local engineering candidate only. No remote execution or caller deployment is authorized.
The completed provider and caller artifacts remain unchanged. This runner never discovers
or applies migrations and the isolated provider remains outside `supabase/migrations`.

Command: `npm.cmd run run:production-institutional-leads-provider`

Operation: `--production-institutional-leads-provider`

Required environment contract (future explicit human authorization only):

- `ALLOW_PRODUCTION_DDL=true`
- `ALLOW_PRODUCTION_INSTITUTIONAL_LEADS_PROVIDER=true`
- `REFLAB_PRODUCTION_DDL_PROJECT_REF`
- `REFLAB_PRODUCTION_DDL_APPROVED_HEAD`
- `REFLAB_PRODUCTION_DDL_DB_URL`

Only project `nagjddldrldwavmfaytc`, Session Pooler
`aws-1-sa-east-1.pooler.supabase.com:5432`, database `postgres`,
`sslmode=require`, installer `postgres.nagjddldrldwavmfaytc` are accepted.
All inherited PG variables, execution overrides and conflicting Production configuration
are rejected. Clean approved HEAD, all untracked/staged changes, executing runner bytes,
recursive static-import closure and immutable predecessor/provider hashes are checked
before creating a session. New tooling is pinned by approved Git HEAD, not self-hashes.

The SQL SHA is `ceadb1591b08e387c1ed061942d4ce069aa66bc7e1563160bd6a7cf8e5b9cb02`.
The exact immutable SQL is split only at its known transaction boundaries. Its BEGIN,
settings and DO body are retained; the runner owns the final COMMIT. A table lock precedes
the external PRE. One persistent connection performs PRE, one provider invocation, POST,
preservation accounting and COMMIT. Managed nonsuperuser postgres and PostgreSQL 17 are
required by the provider and completed-predecessor evidence.

Timeouts: lock 5s, statement 60s, idle transaction 15s, server transaction 180s.
The protected transport additionally bounds connection establishment to 10s, individual
protocol exchanges to 100s, and process lifetime to 190s including connection startup.

PRE requires service_role SELECT/UPDATE only, direct postgres grants without grant option,
no browser privileges or column substitutes, exact table/role/security/policy metadata,
and completed primary/additional predecessor POST. POST adds only service_role INSERT.
Exact raw and effective ACL deltas and protected fingerprints are verified before COMMIT.
No product rows, ledger, state, marker, policy, function, schema or caller are changed.

Already-installed POST is `ALREADY_INSTALLED_REVIEW_REQUIRED`, reexecution REFUSED,
provider invocation zero. Failures distinguish authorization/target/connection, PRE,
mutation, POST and COMMIT. Pre-COMMIT failures roll back; unconfirmed rollback is reported
explicitly. Lost COMMIT acknowledgement is `UNKNOWN_COMMIT_OUTCOME` / AMBIGUOUS,
never retried and requires separately authorized read-only forensic evidence. Output is
credential-checked before serialization and errors never expose raw process/SQL output.

## Output-failure safety

The execution-safety record is independent of the rich output object. It stores append-only
controlled facts before connection, transaction, mutation and COMMIT attempts and after
acknowledgement. Output validation, formatting and redaction cannot reset this record.
The sole `initial()` call constructs the atomic report before execution; neither output
fallback constructs an initial report. SQL, transaction boundaries and accounting are unchanged.

An output failure returns a nonzero exit status and a minimal
`REFLAB_INSTITUTIONAL_LEADS_EXECUTION_SAFETY_V1` envelope when safe to emit:

- Positive preconnection failure may retain `NOT_STARTED` and zero invocations.
- Connection/transaction attempts retain started state; uncertain invocation counts are
  `null`, never invented zero. A known mutation/COMMIT attempt retains at least one invocation.
- Acknowledged COMMIT retains `ACKNOWLEDGED`, `COMMIT` and `commitAcknowledged: true`.
- Ambiguous COMMIT retains `AMBIGUOUS`, forensic review required and no retry permission.
- Unknown outcome or unconfirmed rollback reports `UNKNOWN`, requires separately authorized
  read-only forensic review and never manufactures `NOT_COMMITTED`.
- Confirmed rollback retains its evidence. Existing forensic requirements cannot be cleared.
- Retry, provider execution and forensic execution authorization are always false.

The unchanged secret detector checks both rich output and the emergency envelope. A credential
may collide with a controlled status string or a JSON key. In that case, the same detector
checks a numeric V1 tuple instead. This is a fixed public enum representation of safety facts,
not an encoding of credentials or of the rejected rich payload. Its 13 positions are:

| Index | Meaning / codes |
| --- | --- |
| 0 | Version: 1 |
| 1 | Execution started/possibly started: 0 no, 1 yes |
| 2 | Mutation attempted: 0 no, 1 yes, null unknown |
| 3 | Provider invocation count: nonnegative integer, null unknown |
| 4 | Transaction: 0 not started, 1 started/output failure, 2 rollback, 3 commit, 4 unknown, 5 rollback unconfirmed |
| 5 | Commit: 0 positively not committed, 1 acknowledged, 2 ambiguous, 3 unknown |
| 6 | Rollback: 0 not confirmed, 1 confirmed, 2 unconfirmed |
| 7 | POST: 0 not started, 1 exact, 2 failed, 3 unknown |
| 8 | Read-only forensic review required: 0 no, 1 yes |
| 9 | Automatic retry authorized: always 0 |
| 10 | Any further provider/forensic execution authorized: always 0 |
| 11 | Approval performed: always 0 |
| 12 | Commit acknowledgement observed: 0 no, 1 yes |

If even the numeric representation collides with secret material, no payload is emitted and
the command fails. A broken output sink likewise fails without a second potentially misleading
report or raw exception. The internal facts remain intact; lack of a readable report is never
evidence of nonexecution and never permission to retry. Such a delivery failure requires human
review before a separately authorized read-only forensic, not a provider rerun.

Safe operational order, each step separately authorized:

1. Reviewed dedicated provider execution.
2. Exact provider POST attestation and acknowledged COMMIT.
3. Separately reviewed caller deployment.

Caller deployment before provider POST is forbidden. No generic Supabase push, browser
reconciliation, completed-wave replay, 64249/64253, Phase4, runtime or cutover is authorized.

Local verification uses `node --test scripts/production-adoption/phase3/phase3-institutional-leads-runner.spec.mjs`
and `node scripts/production-adoption/phase3/run-institutional-leads-provider-postgres.mjs`.
The latter uses only disposable loopback PostgreSQL 17 synthetic fixtures; local proof
hooks are never forwarded by the Production entrypoint and are not Production evidence.
