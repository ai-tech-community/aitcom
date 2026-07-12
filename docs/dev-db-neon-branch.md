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

## One-time setup (run in an interactive terminal — needs your Neon login)

```bash
# 1. Install + authenticate the Neon CLI (opens a browser OAuth flow)
npm i -g neonctl
neonctl auth

# 2. Find the project id (the prod endpoint is ep-ancient-poetry-aieo7394)
neonctl projects list

# 3. Create a dev branch off production (copy-on-write; cheap, instant)
neonctl branches create --project-id <PROJECT_ID> --name dev-verify

# 4. Get its POOLED connection string
neonctl connection-string dev-verify --project-id <PROJECT_ID> --pooled
```

Then create `.env.dev` (gitignored) — copy your real `.env` and replace only
`DATABASE_URL` with the branch connection string from step 4:

```
DATABASE_URL="postgres://…@ep-…-dev-verify-pooler.…neon.tech/aitcom?sslmode=require"
```

Everything else (Payload secret, etc.) can be copied from `.env` — the branch is a
throwaway clone.

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

## Production apply (unchanged, deliberate)

Production migrations still go through `pnpm db:apply` (`.env`) — run it **only** in the
same window as the code deploy that needs the schema, never ahead of it.
