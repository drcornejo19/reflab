# Production Preflight Visibility Debt

The original preflight used a least-privileged read-only role. RLS and table privileges prevented several semantic inventories from proving completeness. A non-visible result must be `UNKNOWN/BLOCKER`, never `MISSING`.

## Demonstrated False Positives

- Storage: `avatars`, `Videos`, `Videos Modo Ingles`, and `institutional-content` exist. The four previous `MISSING_BUCKET` results were visibility failures.
- Institution catalog: Production contains 38 permissions, 12 system roles, and 117 role-permission relations. The previous `0/0/0` result was not complete.
- Identity-related counts: privileged evidence found 13 profiles, 37 attempts, six exam results, and one fixture creator with `user_`-prefixed IDs. Earlier zero counts did not prove absence.

## Required Reporting Semantics

- `CONFIRMED`: the evidence role can prove the complete structural/aggregate result.
- `OBSERVED_NOT_PROVEN_COMPLETE`: rows were observed but RLS bypass/completeness was not established.
- `UNKNOWN`: dependencies or visibility are insufficient.
- `ABSENT`: allowed only when catalog-level existence is visible and confirms absence.

The operational preflight now inventories `SELECT` and effective RLS state from
`pg_catalog` before every semantic query. Missing proof, missing `SELECT`, or
active RLS produces an explicit skipped blocker; an observed zero cannot pass.
