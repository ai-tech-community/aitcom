#!/usr/bin/env bash
#
# Seed a local database end-to-end, in dependency order. Each step is guarded:
# a failing or empty seed logs a warning and the rest still run, so a partial
# dataset never blocks `docker compose up` or a local `pnpm db:seed`.
#
# Order matters:
#   1. dev user      — createdBy for the Hub + author for content seeds
#   2. root Hub       — the `ait` community every user is enrolled into
#                      (anchor, not a tenant — no organizer role)
#   3. Payload seeds  — CMS content (also pushes the Payload `public` schema)
#   4. app seeds      — Drizzle `app` schema content
#
# Env is read from the process. On a host, .env is layered then overridden by
# .env.local (Node applies repeated --env-file in order) — matching Next.js, so
# a host seed targets the local DB in .env.local, not whatever .env points at.
# In Docker neither file exists and the process env is used directly.
set -uo pipefail

ENV_ARG=()
[ -f .env ] && ENV_ARG+=(--env-file=.env)
[ -f .env.local ] && ENV_ARG+=(--env-file=.env.local)

run() {
  echo ""
  echo "▶ seeding: $1"
  if pnpm exec tsx "${ENV_ARG[@]}" "$1"; then
    echo "✓ $1"
  else
    echo "⚠ seed failed, continuing: $1"
  fi
}

run scripts/seed-dev-user.ts
run src/server/db/seed-ait-community.ts
run scripts/seed-community-rules.ts
run scripts/seed-articles.ts
run scripts/seed-launchpad.ts
run scripts/seed-demo-challenge.ts
run src/scripts/seed-benchmark.ts
run src/scripts/seed-datacenters.ts
run src/scripts/seed-suppliers.ts
run src/scripts/seed-commitments.ts
run src/scripts/seed-investigations.ts

echo ""
echo "✅ seeding complete"
