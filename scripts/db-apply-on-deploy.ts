/**
 * Vercel build hook: apply pending Payload/app migrations when DATABASE_URL
 * is available, then exit 0 so `next build` can run.
 *
 * - Vercel production: required (fail the build if DATABASE_URL is missing
 *   or apply fails). Already-applied rows are a no-op.
 * - Vercel preview: skip by default. Preview often shares the production
 *   Neon URL; set DB_APPLY_ON_PREVIEW=1 only when Preview DATABASE_URL is
 *   an isolated branch.
 * - Local / GitHub CI `pnpm build`: skip (no VERCEL=1).
 *
 * Escape hatch: SKIP_DB_MIGRATE=1
 * Force locally: DB_APPLY_ON_DEPLOY=1
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { shouldApplyOnDeploy } from "../src/server/db/apply-pending-migrations";

const decision = shouldApplyOnDeploy(process.env);

if (decision.fatal) {
  console.error(`db-apply-on-deploy: ${decision.reason}`);
  process.exit(1);
}

if (!decision.apply) {
  console.log(`db-apply-on-deploy: skip — ${decision.reason}`);
  process.exit(0);
}

console.log(
  `db-apply-on-deploy: applying pending migrations (${decision.reason})`,
);

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "db-apply-pending.ts");
const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");
const result = spawnSync(tsx, [script], {
  stdio: "inherit",
  env: process.env,
  timeout: 120_000,
});

if (result.error) {
  const timedOut =
    result.error.message.includes("ETIMEDOUT") || result.signal === "SIGTERM";
  console.error(
    timedOut
      ? "db-apply-on-deploy: apply script timed out after 120s"
      : "db-apply-on-deploy: failed to start apply script",
    result.error,
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
