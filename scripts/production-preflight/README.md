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
  `BEGIN READ ONLY` transaction includes semantic queries only when all required
  tables and columns were confirmed. Both transactions re-check
  `transaction_read_only` before their first substantive query.
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

## Final gate

The report exposes `targetBlockers`, `migrationBlockers`, `identityBlockers`,
`rlsBlockers`, `functionBlockers`, `grantBlockers`, `integrityBlockers`,
`storageBlockers`, and `objectBlockers`. `overallGate` is `PASS` only when every
category is empty. RLS state, complete policy expressions, function ownership
and source hashes, grants (including inherited roles), index definitions and
predicates, trigger definitions and events, and semantic integrity are all
approval criteria; the `81/30/150/82/111` counts are informational only.
