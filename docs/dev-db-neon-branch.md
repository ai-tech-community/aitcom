# Isolated migration verification — Neon dev branch

**Why:** the local `.env` `DATABASE_URL` points at the **production** Neon database
(verified against `vercel env pull --environment=production`). Running `pnpm db:apply`
with `.env` migrates production. Schema migrations must therefore be verified against
an isolated database first, and applied to production only in the same window as the
code deploy. See ADR-0020 (driver) and the `env-database-url-is-production` memory.

A **Neon branch** is the right isolation tool: it is a copy-on-write clone of the
production database, so it already contains every existing table (unlike a fresh
local Postgres, where the migration chain can't replay from zero — see issue #209).
New migrations apply cleanly on top of it, against real prod-shaped data, with zero
production risk. A branch is a normal Neon cloud endpoint, so the existing
`db-apply` driver (neon-serverless) connects to it directly — no proxy, no code change.

## Concrete coordinates (this project)

- Neon org: `org-odd-forest-17808561`
- Project: `muddy-truth-19293777` (name `ait`) — its `production` branch endpoint is
  `ep-ancient-poetry-aieo7394`, the same host as the prod `.env` `DATABASE_URL`.
- Verify branch: `dev-verify` (endpoint `ep-dawn-silence-ainb5gl5`), created off
  `production` on 2026-07-12.

## One-time setup (run in an interactive terminal — needs your Neon login)

```bash
# 1. Install + authenticate the Neon CLI (opens a browser OAuth flow)
npm i -g neonctl
neonctl auth

# 2. (If the branch doesn't exist) create it off production — copy-on-write, instant
neonctl branches create --project-id muddy-truth-19293777 --org-id org-odd-forest-17808561 \
  --name dev-verify --parent production
```

Then create `.env.dev` (gitignored) as a copy of `.env` with **only** the endpoint id
swapped from the prod endpoint to the branch endpoint (this preserves the database
name, role, and password, which the branch inherits from production):

```bash
sed 's/ep-ancient-poetry-aieo7394/ep-dawn-silence-ainb5gl5/g' .env > .env.dev
```

Verify `.env.dev`'s host is the **branch** endpoint before using it:

```bash
grep '^DATABASE_URL' .env.dev | grep -o 'ep-[a-z0-9-]*'   # must show ep-dawn-silence-ainb5gl5
```

## Verifying a migration

```bash
pnpm db:apply:dev:dry     # dry-run: list pending migrations, apply nothing
pnpm db:apply:dev         # apply pending migrations to the DEV BRANCH only
npx payload generate:types  # regenerate types against the applied schema (reads .env by default;
                            # for the dev branch run: dotenv -e .env.dev -- npx payload generate:types, or export DATABASE_URL first)
```

Confirm the endpoint host in `.env.dev` contains your branch name (`dev-verify`),
NEVER the bare production endpoint, before running `db:apply:dev`.

## Refreshing / tearing down

```bash
neonctl branches reset dev-verify --project-id <PROJECT_ID>   # re-clone from prod (discard test migrations)
neonctl branches delete dev-verify --project-id <PROJECT_ID>  # remove when done
```

## Production apply

Vercel production (and preview, when `DATABASE_URL` is set) applies pending
Payload/app migrations automatically during `pnpm build` via
`scripts/db-apply-on-deploy.ts` → `scripts/db-apply-pending.ts`. That is the
same idempotent applier as `pnpm db:apply`: only unrecorded `src/migrations`
`up()` functions run, then a row is inserted into `payload_migrations`.
Already-applied names are a no-op.

Manual `pnpm db:apply` (`.env`) is still valid for an emergency or a local
operator window, but it is no longer required for a normal production deploy.
Do not apply a new migration to production ahead of the code that needs it.
