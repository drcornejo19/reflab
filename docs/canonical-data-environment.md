# Canonical data environment

`REFLAB_DATA_ENV` identifies the environment of the connected Supabase data.
It does not describe the Next.js execution mode or enable identity-link
creation.

## Supported deployment matrix

| Runtime | Required configuration | Identity behavior |
| --- | --- | --- |
| Local Development | `REFLAB_DATA_ENV=development` and the authorized Development project ref and URL | Resolve Clerk subjects through Development identity links. |
| Vercel Preview | Vercel provides `VERCEL_ENV=preview`; configure `REFLAB_DATA_ENV=development` and the authorized Development project ref and URL | Resolve existing Development identity links. Link creation remains disabled on Vercel. |
| Vercel Production | Vercel provides `VERCEL_ENV=production`; configure `REFLAB_DATA_ENV=production` and the authorized Production project ref and URL | Deployment is deliberately blocked until canonical Production identity links exist. |

`NODE_ENV` is only the Next.js execution mode. `APP_ENV` and
`ENABLE_DEVELOPMENT_IDENTITY_LINKER` do not select the data identity policy.
The linker flag controls only the local endpoint that creates Development
links.

The application fails closed when the data environment is absent, the project
ref and URL disagree, the target is unknown, or a Preview/Production deployment
uses the wrong data environment. Errors must not include URLs, keys, or secrets.

## Production blockers

Before Production can serve traffic:

- add an incremental canonical Production identity resolver;
- remove the Clerk-subject fallback from `reflab_private.request_user_id()`;
- backfill and preflight historical Production identities;
- define manual handling for subjects that cannot be reconciled.

No Production request may temporarily fall back to using a Clerk subject as an
internal RefLab user ID.
