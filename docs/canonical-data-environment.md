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

## Vercel Preview configuration

Configure these values in the Vercel Preview scope only:

| Variable | Preview value |
| --- | --- |
| `REFLAB_DATA_ENV` | `development` |
| `SUPABASE_PROJECT_REF` | `bthnhbpgiyuajsgoccrp` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bthnhbpgiyuajsgoccrp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Development publishable key |
| `SUPABASE_SECRET_KEY` | Development Secret API Key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Development publishable key |
| `CLERK_SECRET_KEY` | Clerk Development secret key |
| `APP_URL` | Stable HTTPS Preview origin |
| `NEXT_PUBLIC_REFLAB_PUBLIC_URL` | The same stable HTTPS Preview origin |
| `CLERK_AUTHORIZED_PARTIES` | The same exact origin, or a comma-separated list of exact HTTPS Preview origins |

Vercel provides `VERCEL_ENV=preview`; do not configure it manually. Keep all
Development linker flags and secrets absent. Do not load Production URLs,
project refs, Clerk keys, Supabase keys, or other Production values into the
Preview scope.

`CLERK_AUTHORIZED_PARTIES` is server-only. Vercel deployments fail closed when
it is missing or invalid. Entries must be origins without paths, query strings,
fragments, credentials, encoded path components, or wildcards. Local
Development defaults to `http://localhost:3000` and may explicitly configure a
different `http://localhost:<port>` origin; Preview and Production require
HTTPS. The allowlist is never derived from request headers or URLs.

## Production blockers

Before Production can serve traffic:

- add an incremental canonical Production identity resolver;
- remove the Clerk-subject fallback from `reflab_private.request_user_id()`;
- backfill and preflight historical Production identities;
- define manual handling for subjects that cannot be reconciled.

No Production request may temporarily fall back to using a Clerk subject as an
internal RefLab user ID.
