#!/usr/bin/env bash
#
# Container entrypoint for the `web` service. Postgres is already healthy by the
# time this runs (compose `depends_on: condition: service_healthy`), so we just
# provision the schema, optionally seed, and start the dev server.
set -euo pipefail

echo "→ Pushing Drizzle 'app' schema..."
pnpm db:push

echo "→ Pushing Payload 'public' schema..."
pnpm exec tsx scripts/payload-push.ts

# Seed on a fresh volume by default.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "→ Seeding database (set SEED_ON_START=false to skip)..."
  pnpm db:seed
fi

echo "→ Starting Next.js dev server on http://localhost:3000 ..."
exec pnpm dev
