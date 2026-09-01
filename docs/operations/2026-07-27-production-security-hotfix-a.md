# RefLab Production Security Hotfix A

## Status

Completed and accepted on 2026-07-27.

This record documents a narrowly scoped production security operation. It contains no tokens, passwords, JWTs, Supabase keys, or unnecessary personal information.

## Context

The production audit identified three exposure risks:

- `public.profiles` had row-level security disabled and browser-facing grants.
- `public.leaderboard` exposed an unused view to application roles.
- the `avatars` bucket had legacy policies that allowed public upload and update.

The operation closed those exposures without changing application data, Storage objects, video paths, Clerk configuration, or the canonical database model.

## Target And Operator

- Supabase project: `reflab`
- Supabase project reference: `nagjddldrldwavmfaytc`
- Database role used for the operation: `postgres`
- Dashboard operator: `drcornejo19`
- Start time: `2026-07-27 17:02:25.140956 UTC`
- Commit confirmation: approximately `2026-07-27 17:03:28 UTC`
- Verification completed: `2026-07-27 17:14:36.499867 UTC`

## Authorized Scope

The operation was limited to:

1. Enabling RLS on `public.profiles`.
2. Revoking browser and application write privileges from `public.profiles`.
3. Keeping temporary read-only access to `public.profiles` for `service_role`.
4. Revoking all application-role privileges from `public.leaderboard`.
5. Removing three legacy avatar policies.
6. Preserving the scoped public avatar read policy.
7. Reloading the PostgREST schema cache.

No other database, Storage, Clerk, Vercel, or application changes were authorized or executed.

## SQL Executed

```sql
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Legacy profiles: close browser and application write access.
alter table public.profiles enable row level security;

revoke all privileges
on table public.profiles
from public, anon, authenticated, service_role;

-- Temporary administrative read only.
grant select
on table public.profiles
to service_role;

-- Unused leaderboard view: no application-role access.
revoke all privileges
on table public.leaderboard
from public, anon, authenticated, service_role;

-- Public avatar reading remains available through avatars_public_read.
drop policy if exists "Allow public avatar upload"
on storage.objects;

drop policy if exists "Allow public avatar update"
on storage.objects;

drop policy if exists "Allow public avatar read"
on storage.objects;

commit;

notify pgrst, 'reload schema';
```

The transaction committed successfully. No fallback SQL or unapproved variation was executed.

## State Before

### Profiles

- Row count: `0`.
- RLS: disabled.
- Policies: none.
- `anon`, `authenticated`, `service_role`, and the owner had broad table grants.

### Leaderboard

- The view had broad grants for `anon`, `authenticated`, `service_role`, and the owner.
- The deployed `/api/ranking` endpoint did not depend on this view.

### Avatar Policies

The following legacy policies existed:

- `Allow public avatar read`
- `Allow public avatar update`
- `Allow public avatar upload`

The correctly scoped read policy also existed:

- `avatars_public_read`: `SELECT` only, limited to `bucket_id = 'avatars'`.

There was no public `DELETE` policy for the `avatars` bucket.

### Institutional Storage

The four policies for `institutional-content` existed and were scoped by active membership and the required content permission:

- `institutional_content_storage_delete`
- `institutional_content_storage_insert`
- `institutional_content_storage_read`
- `institutional_content_storage_update`

### Video Inventory

- `Videos`: 20 objects.
- `Videos Modo Ingles`: 10 objects.
- Total: 30 objects.

## State After

### Profiles

- RLS enabled: `true`.
- Forced RLS: `false`.
- Application grants: only `SELECT` for `service_role`.
- `service_role` has no `INSERT`, `UPDATE`, or `DELETE`.
- Row count remains `0`.

### Leaderboard

- No grants remain for `public`, `anon`, `authenticated`, or `service_role`.
- The view is inaccessible to application roles.

### Avatar Policies

The following policies were removed:

- `Allow public avatar read`
- `Allow public avatar update`
- `Allow public avatar upload`

The following policy remains:

- `avatars_public_read`: public `SELECT` limited to `bucket_id = 'avatars'`.

No public `INSERT`, `UPDATE`, or `DELETE` policy remains for avatars.

### Institutional Storage

All four `institutional-content` policies remained unchanged.

### Video Inventory

- `Videos`: 20 objects.
- `Videos Modo Ingles`: 10 objects.
- Total: 30 objects.
- Objects created, modified, moved, or deleted: `0`.

## Verification Performed

- Anonymous `SELECT` on `profiles`: rejected with HTTP 401.
- Anonymous `SELECT` on `leaderboard`: rejected with HTTP 401.
- Direct anonymous avatar upload using a valid `image/png`: rejected by RLS with HTTP 403.
- Public partial `GET` of an existing avatar: HTTP 206.
- Partial `GET` of one field video: HTTP 206.
- Partial `GET` of one communication video: HTTP 206.
- Temporary Storage probe objects left behind: `0`.
- Database rows modified: `0`.
- Storage objects modified: `0`.

The deployed code was also reviewed:

- `/api/ranking` uses the server-side Supabase administrator client and reads canonical tables, not `public.leaderboard`.
- `/api/profile/avatar` obtains the user from Clerk and uses the server-side Supabase administrator client.
- the Supabase administrator client imports `server-only` and reads a non-public service-role environment variable.

## Deferred Smoke Tests

These checks are non-blocking for this completed hotfix but are mandatory before a future deployment related to profiles or ranking.

### Authenticated Avatar Upload

- Use a controlled authenticated session.
- Call `POST /api/profile/avatar` with an authorized test image.
- Confirm upload succeeds through the server-only endpoint.
- Confirm the endpoint does not depend on public Storage write policies.
- Remove or replace the test object through the same secure flow when appropriate.

Direct browser writes to Storage must not be used for this test.

### Authenticated Ranking

- Call `/api/ranking` with a controlled authenticated session.
- Confirm a valid response.
- Confirm the endpoint does not query `public.leaderboard`.
- Confirm no Clerk user IDs or unnecessary individual data are exposed.

## Security Invariants

- Anonymous access to `profiles` and `leaderboard` must not be restored.
- RLS on `profiles` must not be disabled.
- Public avatar upload, update, or delete must not be restored.
- The Supabase service-role key must remain server-only.
- Video buckets, paths, and objects remain outside this hotfix.

## Conceptual Rollback

There is no approved rollback that restores anonymous access or public Storage writes.

If a legitimate consumer is discovered:

1. Stop and capture the failing request and required access.
2. Prefer a server-side authenticated endpoint.
3. If direct database access is essential, design a narrowly scoped, owner-aware RLS policy.
4. Review the policy, tests, and privacy impact before applying it.

If avatar upload fails, correct the server-only endpoint or introduce an owner-scoped policy. Do not restore public upload or update.

If ranking fails, correct the authenticated server endpoint. Do not restore grants to the legacy view.

## Change Confirmation

This operation changed only RLS/grants for `public.profiles`, grants for `public.leaderboard`, and three legacy policies on `storage.objects`. It did not modify rows, Storage objects, video inventory, Clerk, Vercel, application code, or the canonical schema design.
