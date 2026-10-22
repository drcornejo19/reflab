# Canonical identity production gates

## Ref Performance, Psychology, and Notifications

Before deploying the canonical identity cleanup to Production, run a read-only
preflight over every affected `user_id` column. Clerk subjects that have an
unambiguous `reflab_private.user_identity_links` match require a dedicated,
transactional data migration. Subjects without a unique link require an explicit
manual ownership decision and must not be reassigned automatically.

Development currently has no legacy Ref Performance or Notifications rows. One
`psychology_checkins` row contains an unlinked Clerk subject; it remains untouched
and is intentionally not returned by canonical user reads.

## Scheduled notifications

`GET /api/notifications/scheduled` is a read-only preview. The only mutating job
entrypoint is `POST /api/notifications/scheduled/run`, authenticated with
`CRON_SECRET`. Automatic scheduled delivery remains disabled until an external
scheduler capable of an authenticated POST is configured. Do not reconnect the
Vercel GET cron to the mutating execution path.
