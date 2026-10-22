# Institutional leads server-write candidate

Local engineering only. No Production runner or execution authorization is
provided. The public HTTP endpoint uses the existing server-only admin client;
it never forwards a user JWT. Its payload allowlist, validation, new status,
server timestamps and successful-insert email ordering are preserved.

The archived current table ACL is service_role SELECT/UPDATE, with browser
table privileges absent. This candidate adds exactly service_role INSERT.
It does not repeat either completed service_role wave. The old matrices remain
immutable: the new POST is checked independently before projecting just its
new INSERT away in a copy for predecessor validation. Real evidence never
accepts the explicitly separate synthetic fixture proof.

The new version is 20261014000000, after 20261013131628. Its isolated SQL file
is under scripts/production-adoption/phase3, NOT supabase/migrations. This is
intentional: it is a separate one-shot provider, not part of chronological
migration push. The generic inventory and completed predecessor artifact pins
remain unchanged. A future dedicated harness must execute only this exact
source-pinned provider, whose only mutation is one explicit GRANT.
The transaction refuses partial state and already-installed INSERT.
The local contract additionally validates the completed primary and additional
service-role matrices, 64236/64245/64249, managed installer, PG17, historical
and adoption boundaries. A future isolated runner must pass the exact target,
approved committed HEAD, clean-worktree and artifact gates before connecting,
then execute PRE, this migration once, POST and preservation in one connection.
Standalone SQL does not attest the remote pooler/project or Git HEAD.

Current lead columns must match the 29 named canonical types. The observed
audit-owner SELECT policy must remain exact; there is no browser INSERT policy.
Existing table, column, owner, policy, function, historical and product-state
fingerprints are preserved. Service-role POST is SELECT/INSERT/UPDATE only.
Browser SELECT is not added: canonical authenticated CRM-read policy installation is a
separate provider boundary.

Safe deployment order:

1. Review and separately authorize a new isolated INSERT-only provider/harness.
2. Complete its Production PRE, one execution, exact POST and COMMIT attestation.
3. Only then authorize deployment of the caller fix, with server secret configured.
4. Verify the public submission path under separately approved operational tests.

The existing endpoint is already unable to insert. Provider-first ordering
avoids introducing a premature service-role caller; the old anon caller gains
no authority during the interval. If application deployment fails, the additive
grant does not authorize a replay or automatic privilege rollback.

Local checks (disposable fixture DDL/DML only):

```text
node --test scripts/production-adoption/phase3/phase3-institutional-leads-insert.spec.mjs
node scripts/production-adoption/phase3/run-institutional-leads-insert-postgres.mjs
```

All results are LOCAL synthetic evidence, not Production POST. Required live
PRE must attest canonical column types, current constraints/defaults/triggers,
identity and predecessor state before any future change. No browser grants,
64249/64253, Phase4, runtime enablement, cutover, deployment, commit or push is
authorized by this candidate.
