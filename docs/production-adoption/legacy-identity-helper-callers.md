# Legacy Production Identity Helper Callers

## Findings

No TypeScript or JavaScript runtime caller references the three legacy Production helpers. Their known local callers are historical SQL functions and RLS policies.

### `public.institution_request_user_id()`

Defined by `202607160001_institutional_multitenant_foundation.sql` and consumed by the institution authorization helper family:

- `institution_is_super_admin`
- `institution_has_active_membership`
- `institution_has_permission`
- `institution_can_access_group`
- `institution_can_access_content`
- `institution_can_access_assessment`
- `institution_is_campaign_recipient`
- `institution_storage_tenant`

It is also embedded in historical policies covering user roles, memberships, membership roles/overrides, progress, groups, content assignments, institutional clips, assessment sessions/feedback, notification recipients, consents, and demo sessions.

### `public.platform_request_user_id()`

Defined/replaced by `202607240001_access_control_foundation.sql` and `202607240002_core_rls_lockdown.sql`. It is consumed by `platform_is_super_admin` and historical policies for profiles, legacy roles, global roles, subscriptions, institution subscriptions, capability overrides, access audit, attempts, official exam results, and historical rules exam results.

### `public.reflab_request_user_id()`

No caller or definition exists in Git. It is a Production-only legacy object and requires a privileged read-only `pg_depend`, function-source-hash, policy-expression, and privilege inventory before any replacement or removal.

## Replacement Strategy

1. Keep all three helpers during Phase 1.
2. Introduce `reflab_private.request_user_id()` only in a later canonical-object phase.
3. Recreate each dependent helper/policy against the private boundary in reviewed batches.
4. Compare policy expressions and behavior before and after each batch.
5. Revoke application execution from legacy helpers after all callers move.
6. Drop only after `pg_depend`, policy inventory, routine grants, and source scanning prove zero callers.

Direct use of JWT/Clerk claims outside the approved private boundary remains a blocker throughout the transition.
