# Phase 0 Backup And Restore Checklist

No adoption write is authorized until every item is evidenced and reviewed. Commands must use placeholders supplied through an approved secret manager; never record passwords or connection strings.

## Capture

- [ ] Record Production project reference, PostgreSQL major version, extension versions, and capture timestamp in the protected change ticket.
- [ ] Produce a logical backup in custom format with ownership/ACL metadata preserved.
- [ ] Produce an independent schema-only backup.
- [ ] Snapshot roles, memberships, object owners, explicit ACLs, `pg_default_acl`, RLS flags, policies, functions, triggers, indexes, and constraints.
- [ ] Snapshot Storage bucket metadata and aggregate object counts/bytes. Do not export object paths into the general evidence pack.
- [ ] Capture aggregate row counts and approved SHA-256 aggregates for identity-bearing tables without emails, names, tokens, or Clerk subjects.
- [ ] Record SHA-256, byte size, tool version, and encrypted storage location for every artifact.
- [ ] Confirm the backup account cannot modify Production.

## Isolated Restore

- [ ] Create a disposable local PostgreSQL instance with no network route to Production.
- [ ] Restore roles required for ownership before restoring schema/data.
- [ ] Restore the custom-format backup into an empty local database.
- [ ] Restore/compare the schema-only artifact independently.
- [ ] Run the Phase 0 fingerprint against the isolated restore.
- [ ] Compare table counts, row counts, constraints, owners, ACL/default ACL, functions, policies, triggers, indexes, and Storage metadata with the source evidence.
- [ ] Verify the six legacy `exam_results` and 37 training attempts using counts/hashes only.
- [ ] Verify the active institutional membership and assignments using aggregate hashes only.
- [ ] Run application-free integrity checks; do not connect the Preview or Production runtime.

## Acceptance Evidence

- [ ] Restore completed without ignored errors.
- [ ] Structural fingerprint matches the captured source fingerprint or every difference is explained.
- [ ] Aggregate row counts and approved hashes match.
- [ ] ACL/default ACL and owner snapshots match.
- [ ] A second reviewer signs the restore evidence.
- [ ] A timed restore demonstrates the rollback objective can be met.
- [ ] Backup retention and destruction dates are recorded.

Any missing artifact, hash mismatch, unexplained object drift, or failed restore is `BLOCKER_BEFORE_ANY_WRITE`.
