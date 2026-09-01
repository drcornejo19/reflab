# Phase 2A: aggregate-only Production semantic audit

## Decision

Phase 2A introduces **temporary Production-adoption infrastructure**, not a permanent canonical object. It does not advance the seven-step adoption ledger and it does not mark the canonical baseline as installed. The checked-in migration is a local proposal and **must not be applied automatically**. A future privileged review must authorize it object by object.

`SECURITY DEFINER is not sufficient by itself`: a function owner without table ownership or `BYPASSRLS` remains subject to RLS. The chosen design therefore uses a dedicated RLS role target plus fixed aggregate functions:

1. `reflab_preflight_audit_owner` is `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, and `NOBYPASSRLS`.
2. It does not own product tables and receives only reviewed column-level `SELECT` grants.
3. Each audited table gets one exact permissive `SELECT` RLS policy for that role. No write policy is added.
4. The role owns one `STABLE SECURITY DEFINER` function with `search_path = pg_catalog`, no arguments, no dynamic SQL, and a fixed JSON aggregate contract.
5. `reflab_prod_preflight_ro` receives schema `USAGE` and `EXECUTE` only. It is never a member of the owner role and its existing direct table reads remain constrained by RLS.
6. `PUBLIC`, `anon`, `authenticated`, `service_role`, and `reflab_rls_owner` receive no access to the audit schema or function.

This deliberately does not reuse `reflab_rls_owner`. That role remains limited to authorization helpers used by RLS; giving it broad semantic visibility would combine runtime authorization and audit responsibilities.

## Threat model

| Threat | Control |
|---|---|
| Caller reads protected rows directly | Existing RLS remains active; no owner membership, table ownership, or bypass is granted. |
| Caller injects a table, column, predicate, or identifier | The function has no arguments and contains no dynamic SQL. |
| Function body resolves attacker-controlled objects | Every relation is schema-qualified and `search_path` is exactly `pg_catalog`. |
| Default function ACL exposes execution | `PUBLIC` and all application roles are revoked before commit; only the preflight role is granted execution. |
| Audit owner mutates product data | It is NOLOGIN, has no memberships, receives no direct DML, owns no product table, and the migration aborts if effective DML is inherited. |
| Report leaks identity or content | The output validator accepts only fixed keys with non-negative integer values. No user ID, subject, email, name, payload, token, path, answer, or exam content is returned. |
| Function is replaced after review | Preflight requires the exact signature, owner, security mode, search path, source hash, policy set, column grants, and execute grants. |
| Aggregate results expose a small population | A count side channel remains. It is accepted only for the exact integrity metrics listed below and only for the restricted Production preflight role. Operational access and report retention remain controlled. |
| Missing/partial installation creates a false PASS | Any contract drift leaves semantic checks skipped and blocked. The aggregate snapshot must contain every exact key and field or the runner aborts. |

## Dependency graph

```text
Phase 1 foundation (empty canonical marker + adoption ledger)
  -> Exam/Training prerequisites
  -> Psychology/Notifications prerequisites
  -> all audited tables/columns present and RLS enabled
  -> dedicated audit role + private audit schema
  -> column SELECT grants + audit-owner SELECT policies
  -> hash-pinned aggregate function
  -> exact EXECUTE grant to reflab_prod_preflight_ro
  -> preflight contract verification
  -> aggregate semantic checks may replace RLS-hidden direct checks
```

The audit bridge is a prerequisite for later `canonical_objects`; it is not itself ledger phase 4 and writes no adoption-state row.

Its lifecycle edge is:

```text
install temporary audit sidecar
  -> collect exact aggregate evidence
  -> complete canonical object/runtime/security cutovers
  -> revalidate the aggregate snapshot in the finalization transaction
  -> remove every audit object, policy and grant
  -> prove teardown complete
  -> insert the canonical marker
```

## Aggregate contract

The function returns one JSON object with ten fixed children:

| Key | Values returned |
|---|---|
| `attempt_semantics` | training/official counts, official orphan count, owner mismatch count, invalid communication-feedback count |
| `scoring_versions` | counts in fixed buckets: legacy unversioned, `field_applicable_v2`, or unknown; split by training/official |
| `exam_integrity` | missing-session, owner-mismatch, and submission-mismatch counts |
| `legacy_access` | legacy-role rows, `automatic_default` rows, and unknown global-role rows |
| `institution_catalog` | permission, system-role, system-relation, and forbidden-role counts |
| `institution_tenant_integrity` | three cross-tenant mismatch counts |
| `matches_tenant_integrity` | institutional appointments lacking an active matching membership |
| `fixture_creator_identity` | creator-reference counts and unresolved profile-reference count |
| `notification_integrity` | token-owner conflict and profile-orphan counts |
| `identity_reference_integrity` | global totals for 63 reviewed identity columns and unresolved profile references |

The global identity result intentionally replaces per-table PASS values. A nonzero orphan total blocks adoption, while remediation requires a separately authorized privileged investigation. This audit never reveals which user or value caused it.

## Preflight integration

The base inventory now includes the audit role, audit-schema grants, column ACLs, policies, function source hash, and routine grants. Only an exact contract activates `reflab_audit.production_semantic_snapshot()`.

When exact, the preflight executes the function inside its existing second `BEGIN READ ONLY` transaction and substitutes the validated aggregate payloads for RLS-hidden direct checks. When absent or drifted, existing `BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN` behavior remains unchanged. Storage and migration-history checks are not routed through this function.

## Blockers this can resolve

- The 63 canonical identity-reference checks currently hidden by RLS.
- Attempt, scoring-version, exam, legacy-access, institution-catalog, tenant, Matches, fixture-creator, and Notifications semantic checks once their required Phase 1 objects exist.

It does not resolve missing tables/columns, policy or grant drift, missing RPCs/functions/triggers/indexes, legacy identity readers, Storage contract drift, absent migration history, or canonical marker finalization.

## Adoption gates and rollback

Before a future application, rerun the privileged fingerprint and verify all listed tables/columns, RLS state, current owners, effective `PUBLIC` privileges, and the exact preflight role attributes. Any effective DML inherited by the new owner aborts the migration.

The migration is transactional. Dependency, role, policy, grant, function, or marker assertion failure rolls back the role, schema, grants, and policies together.

### Teardown and canonical-finalization contract

The final canonical marker is forbidden while any part of the sidecar remains. The preflight therefore emits `BLOCKER_TEMPORARY_SEMANTIC_AUDIT_PRESENT` even when the audit contract and every returned aggregate are valid. This blocker is intentional: Phase 2A can establish semantic evidence, but it can never itself authorize finalization.

A future, separately reviewed `semantic_audit_teardown_future` migration must perform these operations atomically and in this order:

1. Reconfirm every structural, identity, integrity, runtime, RLS, grant and migration-provenance prerequisite for finalization.
2. Invoke the exact hash-pinned snapshot and enforce every allowed aggregate before changing the sidecar.
3. Revoke caller `EXECUTE`, then drop `reflab_audit.production_semantic_snapshot()`.
4. Drop all `reflab_preflight_audit_owner_read` policies and revoke every reviewed column `SELECT` grant.
5. Revoke schema `USAGE`, drop `reflab_audit`, and drop `reflab_preflight_audit_owner` after proving it owns nothing else and has no memberships.
6. Prove that the function, schema, role, policies and ACL entries are absent.
7. Only then insert the canonical installation marker in the same transaction.

Any failure rolls back the teardown and marker insertion together. No destructive migration is created in Phase 2A; this future edge is recorded only in the dependency graph.

The audit policies and grants are intentionally absent from the canonical manifest. While installed, they are extra adoption objects: ordinary object comparison may inventory some extras without rejecting them, so the dedicated lifecycle blocker is the authoritative finalization gate. They must not be silently allowlisted as permanent infrastructure.

## Open risks

- Production has not executed this proposal; actual installation remains a blocker.
- Aggregate queries need query-plan and timeout rehearsal against a restored Production snapshot.
- The count side channel requires operational report-retention rules.
- Existing `PUBLIC` defaults must be rechecked immediately before application; the migration aborts rather than weakening them implicitly.
- Function/policy changes after installation make the audit unavailable until reviewed hashes and contracts are intentionally updated.

