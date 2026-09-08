# Production Role Bootstrap And DDL Installer

## Scope

This bootstrap is a separately approved cluster-level action that precedes Phase 1. It creates only `reflab_rls_owner`; it does not apply migrations, discover pending SQL, write product data, create adoption schemas, or install a canonical marker.

The committed canonical contract identifies `postgres` as the Supabase migration identity and permits exactly one role membership: `reflab_rls_owner` granted to `postgres`. That membership is needed later to transfer only reviewed helper functions to the dedicated owner. Any other membership is drift.

## Role contract

`reflab_rls_owner` is `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`. Immediately after bootstrap it owns no database object, has no direct ACL entries, has no effective table or sequence write privilege, and has no schema `CREATE`. Future helper ownership and read-only authorization-table access belong to later approved adoption migrations, not this bootstrap.

PostgreSQL role DDL (`CREATE ROLE`, role membership `GRANT`, and `COMMENT ON ROLE`) participates in the surrounding transaction. Any failed precondition rolls back the new role, membership, and comment together. Role state is cluster-global, so every rehearsal uses a disposable cluster and cleanup destroys that cluster rather than relying on `DROP DATABASE`.

## Installer contract

The bootstrap runner accepts only the exact direct Production host or approved Session pooler, database `postgres`, SSL mode `require`, project `nagjddldrldwavmfaytc`, and installer identity `postgres`. It requires two independent opt-ins, an externally approved frozen HEAD, a clean worktree, and pinned hashes for both SQL artifacts before starting `psql`.

For role bootstrap, the installer must be `LOGIN`, `INHERIT`, `CREATEROLE`, `NOSUPERUSER`, `NOCREATEDB`, and `NOBYPASSRLS`, with effective `CREATE` on the target database. These capabilities are observed, never granted by the runner. A platform identity that does not match this contract is a blocker.

Phase 1 is a separate approval. Its first migration requires database `CREATE` and creates only its own schemas and state objects. Later adoption migrations additionally require ownership of the exact tables they alter and membership in `reflab_rls_owner` for reviewed helper ownership transfers. Those per-migration capabilities must be attested by a future artifact-specific runner; this bootstrap runner cannot execute Phase 1 or any arbitrary SQL path.

## Execution boundary

Production execution is disabled by default. The only accepted command is:

```powershell
$env:ALLOW_PRODUCTION_DDL = "true"
$env:ALLOW_PRODUCTION_ROLE_BOOTSTRAP = "true"
$env:REFLAB_PRODUCTION_DDL_PROJECT_REF = "nagjddldrldwavmfaytc"
$env:REFLAB_PRODUCTION_DDL_APPROVED_HEAD = "<APPROVED_COMMIT_SHA>"
$env:REFLAB_PRODUCTION_DDL_DB_URL = "<SET_LOCALLY>"
node scripts/production-adoption/bootstrap/run-production-role-bootstrap.mjs --production-role-bootstrap
```

The runner passes only a sanitized environment to `psql`, never prints the URL or password, and records only project, host, database, installer, HEAD, artifact hash, prior role state, and result.

## PostgreSQL 17

The bootstrap uses catalog fields and transactional role DDL available in PostgreSQL 17. No PostgreSQL 18-only catalog fields or syntax are used. Local execution should prefer PostgreSQL 17; when it is unavailable, the rehearsal may run on PostgreSQL 18 with a separate static PG17 compatibility assertion. This does not alter or weaken the PostgreSQL 18-pinned Wave 5 evidence contract.
