# Production Browser Grant Reconciliation

## Scope

The Production preflight reports broad effective privileges, including grants inherited from `PUBLIC` and PostgreSQL default ACLs. This document defines how those findings will be reconciled without a mass revoke.

## Classification Matrix

| Dimension | Values audited separately |
| --- | --- |
| schema | `public`, `storage`, canonical private/meta schemas, legacy schemas |
| object | canonical product table, legacy table, storage object, sequence, routine |
| grantee | `PUBLIC`, `anon`, `authenticated`, `service_role`, inherited role |
| source | explicit ACL, owner default ACL, inherited membership, schema privilege |
| capability | schema usage/create, table DML/select, sequence usage/update, routine execute |

## Reconciliation Procedure

1. Expand effective privileges through `PUBLIC` and role membership; do not classify only direct ACL rows.
2. Identify the exact runtime/browser caller for each `anon` or `authenticated` DML privilege.
3. Classify the object as canonical, legacy-preserved, or Storage-owned.
4. Establish and test the replacement server-side boundary before proposing a revoke.
5. Rehearse each revoke batch against a restored Production snapshot and verify API behavior, RLS, and rollback.
6. Apply schema, table, sequence, and routine changes as separately reviewed batches.

## Role Rules

- `PUBLIC`: unexpected schema usage or routine execute is a blocker; revocation still requires dependency analysis.
- `anon`: no product-table browser DML is canonical unless an explicit public contract proves otherwise.
- `authenticated`: product-table DML must move behind approved server boundaries before revocation.
- `service_role`: evaluated as a server principal, never grouped with browser roles and never granted by blanket statements.
- inherited roles: effective privileges must be attributed to their membership path before changing membership or ACLs.

## Deferred Objects

Storage bucket configuration, `storage.objects` policies, legacy tables, and the three legacy identity helpers remain unchanged in Phase 1. Their existence is not approval of their current privilege contract; it is an explicit preservation decision pending caller and restore evidence.
