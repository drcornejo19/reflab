# Production Role Bootstrap And DDL Installer

## Scope

This bootstrap is a separately approved cluster-level action that precedes Phase 1. It creates only `reflab_rls_owner`; it does not apply migrations, discover pending SQL, write product data, create adoption schemas, or install a canonical marker.

The committed canonical contract identifies `postgres` as the Supabase migration identity. PostgreSQL 17 represents the approved relationship using exactly two `pg_auth_members` rows for the same role/member pair:

- Automatic creator row: role `reflab_rls_owner`, member `postgres`, grantor `supabase_admin`, `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE`.
- Explicit operational row: role `reflab_rls_owner`, member `postgres`, grantor `postgres`, `ADMIN FALSE`, `INHERIT FALSE`, `SET TRUE`.

The first row is PostgreSQL 17's automatic grant to a non-superuser `CREATEROLE` creator. The bootstrap pins `createrole_self_grant` to its empty/default behavior. The second row supplies only the `SET ROLE` capability required by later reviewed ownership transfers, without inherited privileges. `supabase_admin` is the single approved managed-cluster bootstrap grantor; a different grantor fails closed. Any additional row or option drift is incompatible.

## Role contract

`reflab_rls_owner` is `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`. Immediately after bootstrap it owns no database object, has no direct ACL entries, has no effective table or sequence write privilege, and has no schema `CREATE`. Future helper ownership and read-only authorization-table access belong to later approved adoption migrations, not this bootstrap.

PostgreSQL role DDL (`CREATE ROLE`, role membership `GRANT`, and `COMMENT ON ROLE`) participates in the surrounding transaction. Any failed precondition rolls back the new role, membership, and comment together. Role state is cluster-global, so every rehearsal uses a disposable cluster and cleanup destroys that cluster rather than relying on `DROP DATABASE`.

## Installer contract

The bootstrap runner accepts only the exact direct Production host or approved Session pooler, database `postgres`, SSL mode `require`, project `nagjddldrldwavmfaytc`, and installer identity `postgres`. It requires two independent opt-ins, an externally approved frozen HEAD, a clean worktree, and pinned hashes for both SQL artifacts before starting `psql`.

The minimum RefLab capabilities consumed by this step are `LOGIN`, `CREATEROLE`, `NOSUPERUSER`, and effective `CREATE` on the target database. `CREATEDB`, `BYPASSRLS`, `REPLICATION`, and the managed memberships are not RefLab requirements and must never be granted to make the bootstrap pass.

For the single managed Production project `nagjddldrldwavmfaytc`, the real `postgres` identity is pinned separately as ambient platform state: `LOGIN`, `INHERIT`, `CREATEROLE`, `NOSUPERUSER`, `CREATEDB`, `BYPASSRLS`, and `REPLICATION`. Exact matching is a safety fingerprint, not approval for the bootstrap to use those elevated capabilities.

The complete ambient membership inventory involving `postgres` contains exactly ten rows, all with `postgres` as member and `supabase_admin` as grantor:

| Granted role | ADMIN | INHERIT | SET |
| --- | --- | --- | --- |
| `anon` | true | true | true |
| `authenticated` | true | true | true |
| `authenticator` | true | true | true |
| `pg_create_subscription` | true | true | true |
| `pg_monitor` | true | true | true |
| `pg_read_all_data` | true | true | true |
| `pg_signal_backend` | true | true | true |
| `reflab_prod_preflight_ro` | true | false | false |
| `service_role` | true | true | true |
| `supabase_privileged_role` | false | true | true |

No row may have `postgres` as the granted role, and no additional row, grantor, or option combination is accepted. The bootstrap validates this fingerprint before role DDL. It does not issue `ALTER ROLE`, `REVOKE`, or ambient membership `GRANT` statements.

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

## Read-only installer identity evidence

Installer evidence uses the existing Production preflight credential mechanism and never accepts an installer credential. Supply the already-approved read-only values only in the invoking process:

```powershell
$env:ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT = "true"
$env:REFLAB_PRODUCTION_PREFLIGHT_PROJECT_REF = "nagjddldrldwavmfaytc"
$env:REFLAB_PRODUCTION_PREFLIGHT_DB_URL = "<SET_LOCALLY>"
npm run attest:production-ddl-installer
```

The entrypoint does not load application `.env` files. The URL remains process-local, must identify `reflab_prod_preflight_ro`, and is passed through the existing exact target and SSL guard. Inherited `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE`, `PGOPTIONS`, `PGSERVICE`, `PGSERVICEFILE`, or `PGPASSFILE` abort before `psql`. The generated batch is `BEGIN READ ONLY`, timeout-bounded, `SELECT`-only, operationally verifies `transaction_read_only = on`, and always rolls back.

The catalog query selects every `pg_auth_members` row where `postgres` is either the granted role or the member. Its result includes total, member-side, and granted-role-side counts. `DDL_INSTALLER_MANAGED_PROFILE=READY` is possible only when the full result contains exactly the ten rows above, with ten member-side rows and zero granted-role-side rows. Missing summary fields are `UNKNOWN`; any complete but different fingerprint is `BLOCKER`.

## PostgreSQL 17

The bootstrap uses PostgreSQL 17 membership fields `admin_option`, `inherit_option`, and `set_option`. A non-superuser `CREATEROLE` creator receives an automatic grant from the bootstrap superuser with `ADMIN TRUE`, `INHERIT FALSE`, and `SET FALSE`; the explicit grant is separately pinned. Role DDL remains transactional, so any tuple mismatch rolls back creation, comment, and grants together. Local execution should prefer PostgreSQL 17; when it is unavailable, the rehearsal runs on PostgreSQL 18 with static PostgreSQL 17 contract assertions. This does not alter or weaken the PostgreSQL 18-pinned Wave 5 evidence contract.
