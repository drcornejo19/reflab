# Phase 4B Wave 3: reviewed trigger reuse

Wave 3 performs no Production schema DDL. Phase 4A found 44 historical
`updated_at` triggers whose catalog behavior is equivalent to the canonical
target. Creating the canonical names alongside them would execute the same
write effect twice, while renaming them would provide no runtime benefit.

The local Wave 3 gate therefore accepts only the reviewed historical identity
for each table and proves `BEFORE UPDATE`, row level, no `WHEN`, enabled state
`O`, a non-constraint trigger, the reviewed function signature, and exactly one
active trigger with the reviewed `updated_at` effect. Both historical helper
bodies and their catalog contracts are pinned. An unexpected canonical name,
unknown helper, second equivalent trigger, disabled trigger, source drift, or
metadata drift aborts with SQLSTATE `55000`.

The six historical institutional validators remain
`LEGACY_REQUIRED_TEMPORARILY`: assessment assignments, content assignments,
data consents, membership roles, notification recipients, and role
permissions. Wave 3 verifies their trigger identities but does not replace,
rename, disable, or otherwise alter them.

This gate does not advance `production_adoption_state`, does not create a
canonical marker, and does not treat equivalent reuse as canonical naming.
The reviewed aliases remain explicit adoption evidence until a future cutover
decides whether naming reconciliation is needed.
