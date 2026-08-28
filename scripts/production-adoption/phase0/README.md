# Production Adoption Phase 0 Evidence Pack

This package gathers structural evidence before any Production adoption write. It does not contain a migration and it never infers that a Git migration was applied.

## Components

- `fingerprint.mjs` runs two independent `BEGIN READ ONLY` batches. The first discovers dependencies; the second inventories only objects that exist.
- `fingerprint-queries.mjs` contains PII-free structural and aggregate queries. Storage objects are grouped by bucket; names and paths are never selected.
- `compare.mjs` compares a saved fingerprint with the canonical manifest and Git migration hashes. Every object is classified as `EXACT`, `DRIFTED`, `ABSENT`, `LEGACY_EXTRA`, or `AMBIGUOUS`.
- `phase1-security-rehearsal.sql` proves both approved object-creation strategies on local PostgreSQL and rolls back both transactions.
- `phase1-security-rehearsal-failure.sql` deliberately leaves one browser grant so the assertion abort path can be verified.
- `run-security-rehearsal.mjs` accepts only `localhost`, `127.0.0.1`, or `::1` and refuses port `6543`.

## Future fingerprint execution

The fingerprint runner deliberately reuses the exact Production target allowlist from `scripts/production-preflight/target.mjs`. It must be run only after a dedicated read-only evidence credential has sufficient catalog visibility. A section hidden by RLS is reported as `OBSERVED_NOT_PROVEN_COMPLETE` or `UNKNOWN`, never as confirmed missing.

```text
node scripts/production-adoption/phase0/fingerprint.mjs > production-fingerprint.json
node scripts/production-adoption/phase0/compare.mjs production-fingerprint.json > production-comparison.json
```

Environment names and target restrictions are documented by the existing Production preflight. Do not place credentials in shell history, checked-in files, or evidence JSON.

## Local rehearsal

The local PostgreSQL database must already contain the Supabase roles `anon`, `authenticated`, and `reflab_rls_owner`. The runner does not create remote connections and rejects Supabase hosts.

```text
node scripts/production-adoption/phase0/run-security-rehearsal.mjs
```

Successful evidence consists of the positive rehearsal passing, the deliberate ACL deviation aborting, and all rehearsal schemas being absent afterward.
