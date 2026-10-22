# Matches canonicalization production gate

The Matches canonicalization patch must not be deployed to Production until a
read-only preflight has inspected every identity-bearing column in the Matches
tables.

The preflight must count Clerk subjects separately in:

- `referee_eligibility.user_id`;
- `appointments.user_id` and `appointments.created_by_user_id`;
- `appointment_history.user_id` and `appointment_history.changed_by_user_id`;
- `match_officials.user_id`;
- `match_preparations.user_id`;
- `post_match_reviews.user_id`;
- `fixtures.raw_source_reference.created_by`.

If any Clerk subject is present, deployment remains blocked until a dedicated,
transactional data migration has been designed and validated. The application
patch does not persist aliases and must not be used as an implicit migration.
