# Additional-Runtime Browser Policy and Column Forensic

Local engineering only. No remote execution is authorized by this artifact.
The completed primary and additional-runtime service_role waves are immutable.
This tool observes catalog evidence; it neither derives an approved browser target
nor changes tables, policies, roles, functions, ACLs, data or adoption state.

## Future Separately Authorized Command

`npm.cmd run forensic:production-additional-runtime-browser-policy-columns`

Operation: `--production-additional-runtime-browser-policy-column-forensic`

All three opt-ins must equal `true`:

- `ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT`
- `ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION`
- `ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_BROWSER_FORENSIC`

Required identity variables:

- `REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF`
- `REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD`
- `REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL`

Only project `nagjddldrldwavmfaytc`, session pooler
`aws-1-sa-east-1.pooler.supabase.com:5432`, database `postgres`, `sslmode=require`,
installer `postgres.nagjddldrldwavmfaytc` are accepted. The established privileged
read-only identity is retained to avoid silently filtered information_schema
column ACL evidence; pg_catalog is the evidence authority.
Credentials must never be included in review output or documentation.

Before any session construction: exact approved committed HEAD, clean tracked,
staged and untracked state, executing runner bytes identical to its Git blob,
all static transitive imports matching approved Git bytes, all existing protected
SHA pins unchanged, exact target, no inherited PG overrides, no other Production
authorization variables, and hardened structured serialization must pass.
The shared loader's canonical SQL read-dependencies and baseline manifest are also
pinned. Their checkout source inventory must match the approved Git tree, including
rejection of ignored extra source files. This is integrity-only, not migration apply.
New artifacts are pinned by the approved HEAD, not self-referential embedded hashes.
Uncommitted tooling cannot pass these gates.

## Observation

Exactly 57 public tables are collected in a single repeatable-read transaction:
`BEGIN READ ONLY`, local lock 2s, statement 15s, idle 15s, transaction 180s,
always `ROLLBACK`, never COMMIT. A persistent psql session is reused with a
180s client observation watchdog. Catalog, membership and execution-path expansion
have explicit size/depth bounds; timeout closes the session and fails closed.
DDL, DML and migration invocation counts are always zero.

The output includes owners/RLS/FORCE, explicit per-table policy lists (including
empty lists), literal-sensitive `pg_get_expr` predicates, policy roles and catalog
trees, inheritance paths, raw table ACLs and all eight effective PG17 privileges
for anon/authenticated/PUBLIC. Archived counts 352/408 are cross-checks only:
live differences are reported rather than replaced with archive or fixture values.

All user columns and raw column ACL grantors/grantees/grant options are collected,
including grantees beyond the six explicitly requested. Effective anon/authenticated
SELECT/INSERT/UPDATE/REFERENCES column capabilities are separate, with an explicit
table-level capability indicator. No raw column grant is invented from table ACLs.
Every table has its own observed `columnAcls` array, sorted by the canonical row
identity (schema, table, column, grantee, grantor, privilege, grantable). An explicit
`[]` means a completed zero-grant observation. Missing, null, malformed or globally
inconsistent per-table evidence produces UNKNOWN; the global count cannot replace it.
Dedicated institutional_leads INSERT and clips SELECT projections preserve the
relevant policies, function OIDs, raw column grants and effective capabilities.

Policy function OIDs come from PostgreSQL catalog dependency records and parsed
catalog node trees (including operator function OIDs), never function names or
regex extraction from deparsed SQL. Function identity, owner, security mode,
configuration/search_path, return type, language, volatility, strictness,
leakproof status, source SHA-256 and raw/effective EXECUTE evidence are preserved.
The query collects exact `prosrc` as `sourceText` and the nullable catalog SQL-body
representation. Node hashes the UTF-8 bytes of
`JSON.stringify(["SHA256_JSON_ARRAY_PROSRC_SQLBODY_V1", sourceText, sqlBodyTree])`.
No trimming, case folding, EOL normalization or concatenation is performed; JSON
framing distinguishes component boundaries and null from an empty string.
Output uses `sourceSha256` (64 lowercase hex) and the explicit algorithm basis.
Raw `sourceText` is discarded before report construction. No hashing extension or
MD5 source-hash contract is required or accepted.
Nested catalog dependencies and parsed SQL-standard function bodies are traversed
with cycle and size bounds. SQL-body relation permissions are recorded from PG17
RTEPERMISSIONINFO nodes and resolved to catalog relation identities.

PLpgSQL, string-body SQL and external-language implementations do not expose a
complete dependency graph in these catalogs. Their table operations are explicitly
UNKNOWN, not inferred from source text. INVOKER preserves its immediate caller's
identity; a nested INVOKER below DEFINER therefore executes as that DEFINER's owner.
Execution paths report that distinction. Unknown body dependencies are separately
enumerated even when catalog observation is complete; completeness is not policy
usability, safety approval, or a closed least-privilege target.

Incomplete catalog observation, unresolved expression references, unsupported node
constructs, missing function identity, rollback or transport failures produce
UNKNOWN. An observed non-read-only transaction or preconnection gate failure blocks.
USING and WITH CHECK are validated independently. A truly NULL expression needs no
tree. A present predicate with missing, undefined, malformed or incomplete tree
evidence produces UNKNOWN with a deterministic reason. Per-predicate evidence
records expression presence, tree observation and resolution status; an unresolved
function set is null, never an asserted empty dependency set. Existing unresolved
dynamic-dependency behavior remains unchanged.
Predicate validation has a separate explicit node contract: CONST, VAR, FUNCEXPR,
OPEXPR, SCALARARRAYOPEXPR, BOOLEXPR, NULLTEST, ARRAYEXPR, COALESCEEXPR, COERCEVIAIO
and SUBLINK. Each declares mandatory
structural evidence, expression children and dependency semantics. Unsupported
nodes (including nested nodes), missing mandatory fields or malformed children
produce UNKNOWN. Additional node types must be implemented and exercised before
being accepted; the SQL-body inspector does not substitute for this predicate gate.
OPEXPR and SCALARARRAYOPEXPR require a valid direct opfuncid or a valid opno with
one authoritative pg_operator.oprcode mapping. Invalid, ambiguous or conflicting
identifiers fail closed. Operator evidence preserves operator OID, function OID
and resolution basis; scalar-array hash/negator function OIDs are included when
present. A non-null incomplete predicate never projects an empty resolved function
set, including the dedicated institutional_leads and clips evidence.
COALESCEEXPR traverses every argument; it adds no callable of its own.
COERCEVIAIO records the explicit source/result type OIDs and requires observed
pg_type namespace/name and source typoutput / target typinput function OIDs.
Only referenced type OIDs are queried, and those I/O function OIDs enter the
existing pg_proc/sourceSha256/EXECUTE pipeline. No builtin identity is inferred
from an OID convention, local fixture, or function name. Known partial function
references are retained for collection even while a cast remains UNKNOWN.

SUBLINK support is deliberately limited to the observed PG17 EXISTS / SELECT
shape with relation RANGETBLENTRYs, matching RTEPERMISSIONINFOs, FROMEXPR /
RANGETBLREFs and TARGETENTRYs. Nested supported EXISTS queries are traversed;
unimplemented joins, CTEs, write queries, unknown children or missing fields remain
UNKNOWN. Relation OIDs resolve uniquely from observed table/column identities.
Permission bitmasks and selected/inserted/updated column bitmaps remain raw evidence;
decoded privileges and columns are additional evidence. PG17 sysattr.h defines
FirstLowInvalidHeapAttributeNumber=-7, so each bitmap member maps to attnum=member-7.
Whole-row references remain explicit; unobserved system/other columns are UNKNOWN.
checkAsUser=0 is POLICY_CALLER; nonzero identities require captured role metadata.
These direct policy relation dependencies are separate from function-owner access
and the policy target's own ACL. They do not authorize privileges.

Per-predicate and per-policy dependency completeness is explicit. Per-role/action
projections consider only applicable policies and action-relevant predicates;
SELECT uses USING, while INSERT uses WITH CHECK (or PostgreSQL's USING fallback).
An unrelated owner-only policy cannot mask an independently complete authenticated
policy. Global observation can still remain UNKNOWN. These projections describe
dependency catalog evidence, not full helper-body knowledge or policy usability.
Secret-bearing output is rejected in its entirety before serialization, not partially
redacted and falsely claimed as exact evidence.

## Local Validation

New static tests: `node --test scripts/production-adoption/phase3/phase3-additional-browser-forensic.spec.mjs`

Real-node tests: `node --test scripts/production-adoption/phase3/phase3-additional-browser-real-nodes.spec.mjs`

Disposable PG17: `node scripts/production-adoption/phase3/run-additional-browser-forensic-postgres.mjs`

The local fixture is explicitly `SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH`.
Fixture setup alone may perform locally authorized DDL. Its observed forensic is
READ ONLY, rolls back, verifies unchanged catalog state and removes its own cluster.
It exercises PUBLIC and inherited policy applicability, DEFINER/INVOKER nesting,
column-only privileges, table privileges without raw column grants, and unknown
dynamic SQL bodies. No fixture value is asserted to describe Production.

Protected static counts remain 2741 frozen + 157 primary harness + 1058 additional
reconciliation + 371 additional harness = 4327, with new tests counted separately.
No migration, PRE, DDL, Phase4, 64253, runtime or cutover is authorized here.

## Offline Archived Evidence

`node scripts/production-adoption/phase3/reprocess-additional-browser-forensic.mjs <absolute-archive-path>`

The reprocessor reads UTF-8 or BOM-marked UTF-16LE JSON/npm output without changing
the archive. It has no connector or Production runner import and never supplies
missing catalog values from the local database. Original nondependency checks and
integrity facts remain archived evidence, not a new remote attestation.

The completed Production archive does not suffice for full resolution of any of
the three newly supported families: COALESCEEXPR needs missing function evidence
for OID 3214 and its nested cast; COERCEVIAIO needs pg_type records for 2950 and 25
and the corresponding observed typoutput/typinput pg_proc identities. SUBLINK
relations 18067 and 20506 resolve from archived table and column observations,
but function OID 2956 lacks pg_proc evidence. No names or I/O function OIDs are
guessed. A separately reviewed, narrowly authorized supplement would need only
these type records and the missing/discovered function identity/EXECUTE evidence,
not a broader table snapshot. No such observation is authorized by this change.

Next step: commit and independently review this forensic candidate before any
explicit human authorization for one future READ-ONLY Production observation.
