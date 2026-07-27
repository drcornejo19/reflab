# RefLab historical migration policy

## Current state

The 26 historical migration files remain in `supabase/migrations/` and have not
been moved, renamed, deleted, or edited as part of this draft.

They are valuable evidence of how the productive schema evolved, but they are
not a reproducible clean-install chain. Several objects were created manually,
some tables have duplicate historical definitions, and some migrations depend
on structures whose original creation is not versioned.

## Approved future strategy

RefLab will use a consolidated canonical chain:

`canonical baseline -> later canonical migrations`

Historical migrations will move out of the executable chain only after all of
the following are complete:

1. The canonical baseline succeeds on an empty disposable Supabase project.
2. Static and runtime assertions pass.
3. The generated schema matches the approved manifest.
4. A clean install is tested end to end.
5. The remote production migration history is backed up.
6. `supabase migration list --linked` is reviewed.
7. `supabase db push --dry-run` is reviewed but not treated as sufficient proof.
8. The exact official `supabase migration repair` operation is documented.
9. A separate manual approval authorizes the cutover.
10. Production is verified not to execute the baseline SQL.

## What this directory will eventually contain

After cutover approval, this directory may preserve:

- immutable copies of historical migrations;
- an inventory with original filenames and SHA-256 hashes;
- notes describing non-reproducible dependencies;
- mappings from historical objects to the canonical model;
- the approved production history-repair record.

No historical file is moved during the current baseline drafting phase.

## Compatibility objects

The canonical baseline temporarily retains:

- `institution_members`
- `user_roles`

These tables are not sources of truth and receive no new product writes in a
new installation.

Legacy columns in canonical tables remain only where active consumers require a
two-release transition. They must be retired through explicit, forward-only
production migrations after fallback use reaches zero.

## Excluded objects

Production tables excluded from the canonical baseline:

- `profiles`
- `institution_profiles`
- `performance_metrics`
- `institution_programs`
- `institution_program_items`
- `institution_student_progress`

Git-only tables excluded from the canonical baseline:

- `daily_checkins`
- `fatigue_logs`
- `sleep_logs`
- `training_sessions`
- `rule_questions`

Excluded view:

- `leaderboard`

Exclusion from the baseline does not authorize deletion from production.

## Safety rules

- Never execute the canonical baseline on production.
- Never insert migration-history rows manually.
- Never run `migration repair` without the approved runbook and backup.
- Never use `db push --dry-run` as the sole validation.
- Never delete legacy data merely because it is absent from the baseline.
- Stop if the remote history differs from the reviewed inventory.
