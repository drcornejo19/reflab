# Maximum Phase 1 Object Scope

Phase 1 is a purely additive, fail-closed foundation. Its future migration must be newly designed for Production adoption and rehearsed against an isolated restore.

## Allowed Maximum

- A no-login, non-superuser, non-BYPASSRLS `reflab_rls_owner` role when absent.
- `reflab_private` and `reflab_meta` schemas when absent.
- The exact `reflab_meta.reflab_schema_state` table/function/trigger contract, empty and inaccessible to application roles.
- A separate append-only `reflab_meta.production_adoption_state` ledger containing only reviewed plan/fingerprint metadata.
- Additive, nullable compatibility columns and closed catalog/session tables explicitly listed by the Phase 1 bridge.
- Constraints and indexes that preserve historical rows and are required by those additive objects.

## Mandatory Creation Contract

- Every object is created inside one transaction with conservative statement and lock timeouts.
- `PUBLIC`, `anon`, and `authenticated` privileges are revoked before commit.
- New functions have implicit `PUBLIC EXECUTE` revoked before commit.
- Ownership is explicit and verified from `pg_catalog` before commit.
- No runtime grants are introduced; new objects remain inaccessible to `service_role` until a later reviewed cutover.
- Any ACL, owner, RLS, or object-count deviation aborts the transaction.

## Explicitly Excluded

- Storage buckets, bucket metadata, objects, or policies.
- Institution permissions, roles, relationships, memberships, or overrides.
- Exam backfills or synthetic `referee_exam_sessions`.
- Business RPCs and business triggers.
- Runtime grants or replacement of legacy policies.
- Changes to `reflab_private.request_user_id()` or any JWT helper.
- Any row in `reflab_meta.reflab_schema_state`; table infrastructure is allowed, canonical installation data is not.
- Development-only identity-link tables, policies, functions, or RPCs.
- Identity mappings or rewrites of existing IDs.
- Any modification to historical attempts or `exam_results`.

Phase 1 does not make Production runtime-ready. It creates provenance and compatibility infrastructure with no browser or runtime access, and it never claims that the canonical baseline is installed.
