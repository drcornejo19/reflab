# Additional Browser Supplemental Forensic

LOCAL ENGINEERING ONLY. No remote execution or browser ACL mutation is authorized.
The completed service_role waves, 64249, 64253, Phase4 and runtime/cutover boundaries
are unchanged. The historical broad browser runner remains intact.

## Dedicated Operation

`npm.cmd run forensic:production-additional-runtime-browser-supplemental`

Operation: `--production-additional-runtime-browser-supplemental-forensic`.

Require all three opt-ins, exactly `true`:

- `ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT`
- `ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION`
- `ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_BROWSER_SUPPLEMENTAL_FORENSIC`

Require `REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF`,
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD` and
`REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL`. The broad forensic flag and DDL
flags are rejected, not authorization substitutes. Reject inherited PG variables
and Node execution overrides. Before creating a session, require clean committed
HEAD, exact executing runner bytes, transitive committed artifact closure,
protected pins, exact target and safe serialization. Uncommitted candidates refuse
remote execution by design.

Target only project `nagjddldrldwavmfaytc`, host
`aws-1-sa-east-1.pooler.supabase.com`, port 5432, database `postgres`, SSL `require`,
installer `postgres.nagjddldrldwavmfaytc`.

## Query Scope

One persistent connection, READ ONLY REPEATABLE READ, lock timeout 2s, statement
timeout 15s, idle transaction timeout 15s and overall/transaction bound 180s.
Verify transaction_read_only is on. Always ROLLBACK, never COMMIT.

Only function OIDs 2956/3214 and type OIDs 25/2950 are initially queried. Type rows
contain OID, namespace OID/name, type name and typinput/typoutput. Only the observed
2950.typoutput and 25.typinput may expand the function query; duplicates/overlap
are deduplicated. No recursive discovery and no arbitrary caller-provided OIDs.
Function pg_depend references are recorded but never followed. No pg_class,
policy, table ACL, column or column ACL inventory query occurs. The collector does
not call inventorySql. Missing/malformed/extra rows remain UNKNOWN.

Function evidence retains identity, owner/security mode, configuration, volatility,
strictness/leakproof, raw/effective EXECUTE ACLs and SHA-256 source identity using
the unchanged UTF-8 JSON.stringify array basis. Raw source is discarded before
serialization. Credential-bearing output fails closed; database errors are not
serialized verbatim.

Output format `REFLAB_ADDITIONAL_RUNTIME_BROWSER_SUPPLEMENTAL_FORENSIC_V1` is a
small supplement, not another 57-table snapshot. All mutation counters are zero.

## Offline Merge

`node scripts/production-adoption/phase3/reprocess-additional-browser-forensic.mjs <archive-path> <supplement-json-path>`

Archive SHA-256 must be
`cddebda30d4bf4ff7bb06ed67a4b7497fb7ffd654d28e12705f6bb51b03dc0ec`.
The archive stays outside the repository. Both inputs remain untouched. Require
exact supplemental format/scope, complete required records, matching pinned target,
read-only ROLLBACK, integrity attestations and zero mutation counters. Reject extra
scope and conflicting repeated function evidence. The merged view reruns the
dependency analyzer using observed data only. Missing further dependencies remain
UNKNOWN; no fixture substitutes for Production evidence. Preserve separate
observation provenance: two observations are not a single-transaction snapshot.

Static tests: `node --test scripts/production-adoption/phase3/phase3-additional-browser-supplemental.spec.mjs`.
Disposable local PG17: `node scripts/production-adoption/phase3/run-additional-browser-supplemental-postgres.mjs`.
The query-capture tests reject broad inventory fragments and verify fixed OIDs,
restricted I/O expansion, fail-closed gates, rollback and immutable merging.

REMOTE_BROWSER_SUPPLEMENTAL_FORENSIC_AUTHORIZED = NO
REMOTE_BROWSER_FORENSIC_AUTHORIZED = NO
BROWSER_ADDITIONAL_RUNTIME_ACL_DDL_AUTHORIZED = NO
GLOBAL_TABLE_ACL_RECONCILIATION = INCOMPLETE

Next step: commit and review the supplemental-only candidate; not remote execution.
