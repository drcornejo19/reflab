# Current Additional-Runtime Service Role Candidate

This is a local, uncommitted candidate, not Production authorization. The
completed thirteen-table service-role reconciliation remains closed and exact.
No generic Supabase migration push or chronological pending-migration replay is
authorized. A later reviewed isolated harness must execute only verified bytes.

The archived Production forensic SHA-256 is
`56af017f8e98fe32d3f829f6e88cd8473bcdeea3e6c2d46c3292bec9f849a15c`.
Its additional scope contains 57 public tables, owned by postgres, with RLS on,
FORCE off, and eight direct non-grantable service_role grants each. The explicit
matrix is design authority; local synthetic rows/bodies are not Production truth.

The current transition is 456 granted cells to 124 granted and 332 absent:
332 effective revocations, zero grants, and 124 unchanged cells. SQL contains
57 explicit REVOKE statements and no GRANT. DELETE survives only on assessment
items, content assignments, notification campaigns (compensating deletion), and
membership roles. Their current direct callers are respectively
`lib/institutional/assessment-server.ts:505`, `content-server.ts:442`,
`notification-server.ts:271`, and `directory-server.ts:1063`.

Browser raw/effective table grants are preservation-only: 352 anon and 408
authenticated entries. Additional browser policy usability is not adjudicated
here. The public institutional-lead insert uses the publishable-key/anon path;
its missing browser authorization is deliberately not repaired by this wave.

Current coach buckets retain no service_role TABLE privilege. The historical
coach RPC is SECURITY DEFINER postgres. Only a later reviewed CUTOVER replacement
with the canonical INVOKER provider may atomically add SELECT/INSERT/UPDATE.
Invitation acceptance and the canonical five-argument exam RPC remain future
providers. Current installed RPC owners, modes, bodies and EXECUTE ACLs must stay
unchanged; the external classifier pins the actual Production source hashes and
historical fingerprints independently of synthetic local proof.

The SQL guards exact structural PRE/POST and transaction-local preservation of
all non-target public ACLs, columns, policies, functions/EXECUTE, roles,
memberships, owners, RLS/FORCE, indexes, constraints, triggers, additional product
rows, and adoption/runtime boundaries. Standalone SQL is not a substitute for
the full live external PRE/POST classifier in a future isolated harness.
Existing additional column ACLs are collected and preserved, not inferred from
the old forensic (which did not collect these columns), and never rewritten.

Local validation commands (no remote credentials or targets):

```text
node scripts/production-adoption/phase3/run-current-service-role-static-regression.mjs
node --test scripts/production-adoption/phase3/phase3-current-service-role-harness.spec.mjs
node --test scripts/production-adoption/phase3/phase3-additional-runtime-service-role.spec.mjs
node scripts/production-adoption/phase3/run-additional-runtime-service-role-postgres.mjs
```

The new `.spec.mjs` file is separate from the frozen 64-file, 2741-case inventory;
the existing 157-case harness is also counted separately. No overlapping suite
counts may be used to inflate the total. Global ACL reconciliation remains
incomplete, browser reconciliation is separate, 64253 needs independent review,
runtime usability is unestablished, and Phase4/runtime/cutover are not authorized.
