# RefLab canonical database baseline

## Status

This directory describes a draft baseline for a new, empty RefLab Supabase
project. It has not been executed against Supabase, production, or a local
database.

- Baseline version: `202607270000`
- Clean source commit: `eddbd63140d56900a622d7a2fd12ccdae64d053a`
- Production remains on: `eddbd63`
- Approved migration strategy: consolidated canonical chain
- Current historical migrations moved: no
- Remote migration history repaired: no

The SQL must not be applied to the existing production project.

## What the baseline represents

The baseline is a reconciled target model, not a dump of production and not a
replay of the 26 historical migrations.

| Category | Count |
| --- | ---: |
| Canonical tables observed in production | 75 |
| Temporary compatibility tables | 2 |
| New canonical tables | 2 |
| Public product tables created by the baseline | 79 |
| Production tables deliberately excluded | 6 |
| Git-only tables deliberately excluded | 5 |
| Views deliberately excluded | 1 |

The production inventory remains mathematically separate:

`75 canonical + 2 compatibility + 6 excluded = 83 production tables`

The two new tables are:

- `referee_exam_sessions`
- `psychology_modules`

The table totals use two different scopes and must not be conflated:

`75 production canonical + 2 compatibility + 2 new canonical = 79 public tables`

`79 public tables + 1 private installation marker = 80 baseline tables`

The eightieth table is `reflab_meta.reflab_schema_state`. It is private
installation metadata, not a product table and not a Supabase-managed table.
The manifest records the classification, reason, source file, and creation line
for every table.

The deterministic structural inventory currently contains:

| Object | Count |
| --- | ---: |
| Tables including the installation marker | 80 |
| Canonical functions | 21 |
| Public policies | 117 |
| Storage policies | 3 |
| Policies total | 120 |
| Triggers | 82 |
| Explicit indexes | 110 |
| Primary keys | 80 |
| Foreign keys | 61 |
| Unique constraints | 40 |
| Check constraints | 297 |

`npm run test:baseline` derives these objects from the canonical SQL and
compares every entry with `manifest.json`. The policy inventory includes name,
table, command, roles, permissive mode, authorization helpers, and access
category; a missing, additional, renamed, or relocated policy fails validation.

The compatibility tables are:

- `institution_members`
- `user_roles`

They are read-only snapshots in a new installation. New product writes must use
`institution_memberships`, `user_global_roles`, and `user_subscriptions`.

## Explicit exclusions

The following production tables are not part of the canonical model:

- `profiles`
- `institution_profiles`
- `performance_metrics`
- `institution_programs`
- `institution_program_items`
- `institution_student_progress`

The following Git-only tables are also excluded:

- `daily_checkins`
- `fatigue_logs`
- `sleep_logs`
- `training_sessions`
- `rule_questions`

The public `leaderboard` view is excluded. A future leaderboard must be served
through an authenticated, privacy-preserving server endpoint.

`program_id` is deliberately omitted from `institution_cohorts` and
`institution_groups`. The complete programs subsystem must return in one future
functional migration.

## Creation order

1. Installation guard.
2. Private schemas and the dedicated RLS helper owner.
3. Catalog, identity, role, plan, and capability tables.
4. Institutions, memberships, permissions, groups, content, and assessments.
5. Competition, fixture, appointment, and match tables.
6. Clips, library, exam, result, and attempt tables.
7. Performance, Psychology, Coach, CRM, notification, and audit tables.
8. Deferred foreign keys and tenant-coherence constraints.
9. Indexes.
10. Integrity functions and triggers.
11. Canonical catalog data.
12. RLS helpers, RLS policies, and minimum grants.
13. Storage buckets and read policies.
14. Immutable installation marker.
15. Installation assertions and transaction commit.

## Identity and authorization

Clerk is the canonical identity provider. Database ownership is based on:

`auth.jwt() ->> 'sub'`

Global roles, individual subscriptions, and institution membership are stored
separately:

- Global role: `user_global_roles`
- Individual plan: `user_subscriptions`
- Institution plan: `institution_subscriptions`
- Institution membership: `institution_memberships`
- Role assignment: `institution_membership_roles`
- Capability definition: `capabilities` and `plan_capabilities`
- Explicit exception: `capability_overrides`

The `reflab_rls_owner` role is `NOLOGIN`, is not a superuser, does not inherit,
does not own product tables, and does not have `BYPASSRLS`. It owns only the
approved `SECURITY DEFINER` authorization helpers and receives read access only
to their authorization tables.

The installation sequence is intentionally narrow:

1. Create or validate `reflab_rls_owner`.
2. Grant that role to the Supabase migration role `postgres`.
3. Create `reflab_private` with no access for `PUBLIC`.
4. Grant `CREATE` on `reflab_private` to `reflab_rls_owner` temporarily.
5. Create and transfer only the four approved authorization helpers.
6. Revoke `CREATE` from `reflab_rls_owner`.
7. Assert role attributes, membership, function ownership, and the final
   absence of `CREATE`.

The role must be tested on a disposable Supabase project. If the platform does
not permit these exact role properties, installation must stop; `postgres` must
not be used silently as a fallback.

## Exam integrity

`referee_exam_sessions` fixes the user, discipline, context, item order,
manifest, version, and expiration before answers are accepted.

The manifest contains only:

- `source_item_type`
- `source_item_id`
- `occurrence_id`
- `position`
- optional `source_version`

It cannot contain correct answers. Global and institutional clip references are
validated when the session is created. A manual item uses the same UUID for
`source_item_id` and `occurrence_id`; for all reusable content,
`source_item_id` identifies the content and `source_occurrence_id` identifies
that appearance inside one exam.

`public.submit_referee_exam` is:

- callable only by `service_role`;
- `SECURITY INVOKER`;
- fixed to `search_path = pg_catalog`;
- transactional and idempotent;
- locked by user and submission;
- limited to 100 items and 256 KiB;
- matched exactly against the immutable manifest;
- responsible for one `exam_result` and one `attempt` per occurrence.

The browser must never call this function directly. The future server endpoint
must obtain the Clerk user ID, validate and score answers, normalize the JSON,
calculate the hash, and then call the function with the development or
production server-only service role as appropriate.

### Canonical exam JSON

The baseline uses `reflab_private.canonical_jsonb_text(jsonb)` before SHA-256:

- object keys sorted with the PostgreSQL `C` collation;
- arrays kept in their original order;
- strings encoded as JSON strings;
- numbers emitted without insignificant decimal scale;
- booleans and null emitted as JSON literals;
- UTF-8 input to SHA-256.

The server implementation must match this algorithm byte for byte. This is a
blocking acceptance test before the baseline can be considered executable.

## Attempts semantics

- `app_correct = TRUE`: APP criterion applied correctly.
- `app_correct = FALSE`: APP criterion applied incorrectly.
- `app_correct = NULL`: criterion not evaluated or evidence unavailable.
- `discipline_correct` remains temporary compatibility data.
- `disciplinary_correct` is the canonical spelling.
- `source_item_id` identifies the stable source or snapshot.
- `source_occurrence_id` identifies one occurrence inside an exam result.

The partial unique index on `(exam_result_id, source_occurrence_id)` prevents
duplicate insertion inside one result while allowing reuse across exams.

## Psychology

`psychology_modules` is the catalog for all required `module_slug` foreign keys.
The audited slugs are:

- `gestion-error`
- `presion-competitiva`
- `concentracion-foco`
- `confianza-arbitral`
- `resiliencia`
- `preparacion-mental-pre-partido`
- `evaluacion-post-partido`
- `sin-clasificar` (inactive and explicit; never a database default)

A production reconciliation remains separate: nullable column, reviewed
backfill, consumer deployment, zero-null verification, then `NOT NULL`.

## Institutional clips

`sport_type` is required and has no default. The creator must reject requests
that omit it.

The additional nullable fields are:

- `subtopic`
- `rule_reference`
- `season`
- `source_version`
- `source_official`
- `governing_body`
- `technical_resolution`
- `disciplinary_resolution`
- `normative_status`
- `language`
- `reviewed_at`

No historical defaults are fabricated.

## Storage

`Videos` and `Videos Modo Ingles` remain public only for recovery compatibility.
Their limit is 100 MiB and their allowed types are MP4, QuickTime, and WebM.

`avatars` remains publicly readable. `institutional-content` is private.

There are no browser `INSERT`, `UPDATE`, or `DELETE` policies on
`storage.objects`. Uploads, replacements, and deletions must use server-only
endpoints.

## Installation guard

The baseline aborts before creating product objects if it finds:

- an existing `reflab_meta.reflab_schema_state`;
- any nonstandard table in `public`;
- any row in `supabase_migrations.schema_migrations`;
- any RefLab-managed bucket.

The only pre-existing table allowed in `public` is:

- `spatial_ref_sys`

Supabase/PostgreSQL system schemas are not treated as product tables. Expected
platform schemas may include:

- `auth`
- `extensions`
- `graphql`
- `graphql_public`
- `information_schema`
- `net`
- `pg_catalog`
- `pg_toast`
- `pgbouncer`
- `pgsodium`
- `pgsodium_masks`
- `realtime`
- `storage`
- `supabase_functions`
- `supabase_migrations`
- `vault`

The exact set varies by Supabase platform version. Their presence alone is not
evidence of a prior RefLab installation.

## Installation marker and hashes

The immutable marker lives outside PostgREST in
`reflab_meta.reflab_schema_state`.

Hash generation is deterministic:

0. Use the LF-normalized UTF-8 bytes stored in Git, not a platform-specific
   CRLF checkout.
1. In `manifest.json`, replace `integrity.sql_checksum` and
   `integrity.manifest_hash` with 64 zeroes.
2. Serialize JSON with two-space indentation and one final LF.
3. SHA-256 those UTF-8 bytes to obtain `manifest_hash`.
4. Put that manifest hash in the SQL marker.
5. Replace only the SQL marker's `sql_checksum` literal with 64 zeroes.
6. SHA-256 the UTF-8 SQL bytes to obtain `sql_checksum`.
7. Store both final values in the SQL marker and manifest.

The marker is inserted only at the end of a successful baseline transaction.
`node scripts/security/validate-canonical-baseline.mjs --write` is the only
approved generator for the manifest inventory and integrity values. It does not
connect to Supabase or execute SQL.

## Baseline versus production reconciliation

This SQL creates the final state directly in an empty database. It is not a
production migration.

Production changes must be separate forward-only migrations, for example:

1. add a nullable column;
2. deploy compatible readers/writers;
3. backfill reviewed data;
4. verify zero invalid rows and zero fallback reads;
5. add or validate the final constraint;
6. remove legacy data in a later approved release.

No generic post-baseline reconciliation file exists in this draft.

## Consolidated-chain cutover

The approved strategy is a single future executable chain:

`canonical baseline -> later canonical migrations`

The 26 historical migrations remain untouched for now.

The future runbook, not yet created, must contain:

1. Scope, owners, prerequisites, and stop conditions.
2. Git file cutover and preservation of historical evidence.
3. Full execution on a disposable Supabase project.
4. Manifest and schema-diff validation.
5. Backup of remote migration history.
6. `supabase migration list --linked` review.
7. `supabase db push --dry-run` as an informational check only.
8. Official `supabase migration repair` plan and exact approved versions.
9. Production verification proving the baseline SQL was not executed.
10. Rollback before repair, after complete repair, and after partial repair.

No migration repair may occur without a separate manual approval.

## Current blockers

- No disposable database execution has been performed.
- Supabase CLI, `psql`, and a PostgreSQL SQL parser are not installed in this
  isolated worktree.
- The repository does not yet contain an approved `supabase/config.toml`.
- The server endpoint and TypeScript canonical JSON implementation do not yet
  exist in this baseline-only phase.
- Historical migrations still precede this file in the executable directory.
- Production reconciliation migrations have not been designed or approved.
- Public video buckets remain a temporary compatibility risk.

These blockers are intentional. This draft must not be represented as an
executable or production-ready baseline until all disposable-environment tests
pass.
