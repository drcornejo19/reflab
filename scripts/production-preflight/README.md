# Production read-only preflight

This harness inventories Production without applying migrations or changing data.
It is deliberately disabled unless the caller supplies an explicit opt-in, the
exact Production project ref, and a database URL matching one of the two exact
allowlisted Production targets.

## Safety model

- The target guard rejects unknown hosts and any environment value containing the
  Development project ref.
- No connection is opened until the target guard succeeds.
- Every SQL batch starts with `BEGIN READ ONLY`, applies conservative local
  statement and lock timeouts, verifies `transaction_read_only`, and ends with
  `ROLLBACK`.
- The SQL validator permits only `SELECT`, `SHOW`, `BEGIN READ ONLY`, `ROLLBACK`,
  and the two approved `SET LOCAL` statements. psql meta-commands are forbidden.
- The first transaction reads only system catalogs. A second, independent
  `BEGIN READ ONLY` transaction includes a semantic query only when every required
  table and column exists, the auditor has `SELECT`, and row security is not active
  for the auditor on any required table. Unknown or RLS-limited visibility is a
  blocker, never an implicit pass from an observed zero. Both transactions
  re-check `transaction_read_only` before their first substantive query.
- The connection role is inventoried before semantic queries. Superuser,
  `BYPASSRLS`, role/database creation, schema creation, table DML, or sequence
  write privileges stop the semantic phase and make the final gate a blocker.
- The `psql` subprocess receives only operating-system launch variables and the
  six explicit `PG*` connection fields. Inherited `PGOPTIONS`, service files,
  passfiles, and application environment values are never forwarded.
- Query results use versioned Base64 frames with CR/LF removed in SQL. The runner
  validates and decodes each complete envelope under an explicit 64 MiB buffer;
  malformed or oversized output aborts without echoing raw payloads.
- Function bodies are normalized and hashed immediately after decoding, then
  discarded before inventory comparison or report construction.
- Reports contain object names and aggregate counts, never Clerk subjects, emails,
  names, Storage paths, notification tokens, database credentials, or function
  bodies. Function and policy content is compared through SHA-256 fingerprints.

### Phase 2A aggregate audit boundary

The optional Production-adoption audit bridge is recognized only when its
entire local contract is exact: dedicated `NOLOGIN` owner attributes, no caller
membership, hash-pinned `SECURITY DEFINER` source, `search_path = pg_catalog`,
reviewed column grants, one owner-only SELECT policy per audited table, and an
exclusive EXECUTE grant to `reflab_prod_preflight_ro`.

When that contract is complete, the semantic phase calls
`reflab_audit.production_semantic_snapshot()` inside the independent read-only
transaction. The function has no arguments and returns only fixed aggregate
counts. The runner validates every key and numeric field before replacing the
corresponding RLS-hidden checks. Identity references are represented by one
global integrity aggregate; the runner never fabricates per-table PASS values.

If any part is absent or drifted, direct RLS-hidden queries remain skipped with
`BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN`. Installation of a similarly named
function never weakens this gate. See
`docs/production-adoption/phase2a-semantic-audit.md` for the threat model.

This boundary is temporary adoption infrastructure and is deliberately absent
from the canonical manifest. Even an exact installation adds
`BLOCKER_TEMPORARY_SEMANTIC_AUDIT_PRESENT` to the final gate. Canonical
finalization must validate the snapshot and tear down the function, policies,
column grants, schema, and owner role atomically before inserting the marker;
there is no teardown migration in Phase 2A.

## Production identity contract

The current canonical baseline stores the Clerk subject (`user_*`) directly as
the internal `user_id`. `reflab_private.request_user_id()` is the single approved
boundary that reads the JWT subject under its exact baseline source/security
contract. Other functions that read Clerk/JWT identity directly, or any function
that falls back from a canonical lookup to an external subject, remain blockers.

`reflab_private.user_identity_links` and the three Development identity RPCs are
Development-only infrastructure. The table, its columns, uniqueness, RLS, and
policies are not Production object requirements. The migrations that create or
consume that mapping remain `NEVER_EXECUTE_IN_PRODUCTION`; if a Development RPC
is executable by an application role in Production, the preflight blocks.

Identity aggregates in Production validate that persisted references resolve to
the canonical profile contract. A `user_*` shape is inventory, not evidence of
an unresolved or non-canonical identity by itself.

## Required future environment

The harness is not run as part of tests and must not load application `.env` files.
Use a clean process environment containing only:

- `ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT=true`
- `REFLAB_PRODUCTION_PREFLIGHT_PROJECT_REF=<exact Production ref>`
- `REFLAB_PRODUCTION_PREFLIGHT_DB_URL=<allowlisted read-only PostgreSQL URL with sslmode=require>`

The database account must itself be read-only. The transaction guard is a second
barrier, not a substitute for least-privilege credentials.

The URL must use exactly one of these target forms:

- Direct host: `db.<Production ref>.supabase.co`, port `5432` (explicit or
  implicit), database `postgres`, and user `reflab_prod_preflight_ro`.
- IPv4 Session pooler: `aws-1-sa-east-1.pooler.supabase.com`, explicit port
  `5432`, database `postgres`, and user
  `reflab_prod_preflight_ro.<Production ref>`.

## Local validation

`npm run test:production-preflight` performs static tests only. It never starts
the runner and never opens a network connection.

## Migration classifications

- `legacy_historical_not_for_replay`: known history retained for comparison only.
- `empty_database_only`: canonical baseline; never apply over an existing database.
- `development_only`: must never be adopted by Production.
- `incremental_requires_adoption`: reusable only after the Production adoption
  gates and dependencies pass.
- `unknown`: remote migration absent from the local manifest; blocks adoption.

The harness never recommends the baseline or Development-only migrations for
Production. Incremental migrations remain manual adoption candidates only after
every object and data gate passes. Unknown migrations are `BLOCKER`, never a
warning.

## REQUIRED_IN_PRODUCTION

- `public.admin_set_canonical_user_plan(text, text, text, text)`
- `public.admin_set_canonical_global_role(text, text, text, text)`
- `public.submit_canonical_communication_feedback(text, uuid, text, jsonb)`
- `public.submit_referee_exam(text, uuid, uuid, text, jsonb)`
- `public.consume_coach_rate_limit(text, text, integer, integer)`
- `public.submit_canonical_training_attempt(text, uuid, jsonb, integer)`
- `public.accept_canonical_institution_invitation(text, uuid, text[])`

## MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION

- `public.resolve_development_clerk_identity(text)`
- `public.link_development_clerk_identity(text)`
- `public.link_development_super_admin_clerk_identity(text)`

Presence of an extra historical object is inventory only. Missing required
objects, incompatible definitions, executable Development RPCs, and unknown
migrations are approval blockers. Counts are sanity checks only.

Migration history discovery uses `pg_catalog`, not privilege-filtered
`information_schema` views. If `supabase_migrations.schema_migrations` does not
exist, lacks required columns, cannot be selected, or is hidden by active RLS,
the history check is skipped with a blocker. The harness never infers an applied
migration solely from matching objects.

## Final gate

The report exposes `targetBlockers`, `migrationBlockers`, `identityBlockers`,
`rlsBlockers`, `functionBlockers`, `grantBlockers`, `integrityBlockers`,
`storageBlockers`, and `objectBlockers`. `overallGate` is `PASS` only when every
category is empty. RLS state, complete policy expressions, function ownership
and source hashes, grants (including inherited roles), index definitions and
predicates, trigger definitions and events, and semantic integrity are all
approval criteria. Sanity counts are derived from the current Production object
collections and remain informational only; they never approve or block a run.
