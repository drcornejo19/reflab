# Maximum Phase 1 Object Scope

Phase 1 is a purely additive, fail-closed foundation. Its future migration must be newly designed for Production adoption and rehearsed against an isolated restore.

## Allowed Maximum

- A no-login, non-superuser, non-BYPASSRLS `reflab_rls_owner` role when absent.
- `reflab_private` and `reflab_meta` schemas when absent.
- An empty `reflab_private.user_identity_links` table.
- An empty `reflab_meta.reflab_schema_state` table, or one explicit adoption marker containing only reviewed schema/fingerprint metadata.
- Constraints and indexes required solely to keep those new empty tables internally coherent.
- RLS and `FORCE ROW LEVEL SECURITY` on private identity data.

## Mandatory Creation Contract

- Every object is created inside one transaction with conservative statement and lock timeouts.
- `PUBLIC`, `anon`, and `authenticated` privileges are revoked before commit.
- New functions have implicit `PUBLIC EXECUTE` revoked before commit.
- Ownership is explicit and verified from `pg_catalog` before commit.
- No runtime grants are introduced.
- Any ACL, owner, RLS, or object-count deviation aborts the transaction.

## Explicitly Excluded

- Storage buckets, bucket metadata, objects, or policies.
- Institution permissions, roles, relationships, memberships, or overrides.
- Exam backfills or synthetic `referee_exam_sessions`.
- Business RPCs and business triggers.
- Runtime grants or replacement of legacy policies.
- Changes to `reflab_private.request_user_id()` or any JWT helper.
- Identity mappings or rewrites of existing IDs.
- Any modification to historical attempts or `exam_results`.

Phase 1 does not make Production runtime-ready. It only creates empty infrastructure with no browser or runtime access.
