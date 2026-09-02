# Phase 4B Wave 1: inert private helpers

## Scope

Wave 1 installs only the 16 `reflab_private` helper functions classified as
`SAFE_INSTALL_PHASE4B` by the Phase 4A structural contract. Their source is
copied deterministically from the empty-database canonical baseline, but the
new migration is the sole Production-safe adoption provider.

The wave does not create triggers, policies, indexes, constraints, runtime
RPCs, identity mappings, or a canonical installation marker. It does not
advance `reflab_meta.production_adoption_state`; the ledger remains at
`canonical_objects` / order 4.

## Security state

The three authorization helpers are `SQL`, `STABLE`, `SECURITY DEFINER`, owned
by `reflab_rls_owner`, and fixed to `search_path=pg_catalog`. The 13 trigger
helpers are `PL/pgSQL`, `VOLATILE`, `SECURITY INVOKER`, owned by the installer,
and use the same safe search path.

All 16 finish with no `EXECUTE` for `PUBLIC`, `anon`, `authenticated`, or
`service_role`. This is intentionally stricter than the fully activated
baseline: any application-role execution needed by future canonical policies
must be granted in the reviewed activation wave that creates those callers.

## Fail-closed contract

An absent helper is installed. An existing helper is accepted only when its
full catalog contract, normalized source hash, owner, overload count, provider
comment, and ACL are exact. Unknown drift, a second overload, an unsafe role
membership, a Development-only identity object, a premature canonical marker,
or conflicting provider evidence aborts with SQLSTATE `55000` before any helper
is installed.

The source hash is SHA-256 over `pg_proc.prosrc` after removing only outer
POSIX whitespace. Internal whitespace remains contractual.

## Deferred objects

The canonical `submit_referee_exam(text,uuid,uuid,text,jsonb)` and
`accept_canonical_institution_invitation(text,uuid,text[])` RPCs, plus the
canonical replacement of `consume_coach_rate_limit(text,text,integer,integer)`,
remain `CUTOVER_ONLY`. The historical 13-argument exam RPC remains
`LEGACY_REQUIRED_TEMPORARILY`.

## Go/no-go evidence

The local rehearsal applies Phase 1, Phase 2A, Phase 2B, Phase 3, then Wave 1
inside a fresh disposable PostgreSQL cluster. The positive case verifies exact
contracts, closed ACLs, historical counts, legacy writes, fail-closed canonical
RPCs, empty schema state, temporary semantic sidecar presence, and absence of
Development identity objects. Each negative case receives its own independent
cluster and proves both SQLSTATE `55000` and transaction rollback.
