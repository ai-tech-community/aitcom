/**
 * Idempotent Payload/app migration applier.
 *
 * Used by `pnpm db:apply` (local) and the Vercel build hook. Only runs `up()`
 * for names not yet in `payload_migrations`, then records them. Repo migrations
 * are additive (`CREATE`/`ALTER` … `IF NOT EXISTS`); already-applied rows —
 * including `20260831a_hub_dm_mail` after the #254 leftover — are a no-op.
 */

export type ListedMigration = {
  name: string;
  up: (args: unknown) => Promise<void>;
};

export type AppliedRow = {
  name: string;
  batch?: string | number | null;
};

export type ApplyPendingStore = {
  listApplied: () => Promise<AppliedRow[]>;
  runUp: (migration: ListedMigration) => Promise<void>;
  record: (name: string, batch: string) => Promise<void>;
};

export type ApplyPendingResult = {
  status: "noop" | "dry-run" | "applied";
  pending: string[];
  recorded: string[];
  batch: string | null;
};

export type DeployEnv = {
  VERCEL?: string;
  VERCEL_ENV?: string;
  DATABASE_URL?: string;
  SKIP_DB_MIGRATE?: string;
  DB_APPLY_ON_DEPLOY?: string;
};

export type DeployApplyDecision = {
  apply: boolean;
  fatal: boolean;
  reason: string;
};

function isTruthyFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function selectPendingMigrations<T extends { name: string }>(
  migrations: T[],
  applied: Iterable<string>,
): T[] {
  const seen = new Set(applied);
  return migrations.filter((migration) => !seen.has(migration.name));
}

export function nextBatch(applied: AppliedRow[]): string {
  const max = applied.reduce(
    (current, row) => Math.max(current, Number(row.batch) || 0),
    0,
  );
  return String(max + 1);
}

export async function applyPendingMigrations(
  migrations: ListedMigration[],
  store: ApplyPendingStore,
  options: { dryRun?: boolean } = {},
): Promise<ApplyPendingResult> {
  const applied = await store.listApplied();
  const pending = selectPendingMigrations(
    migrations,
    applied.map((row) => row.name),
  );

  if (pending.length === 0) {
    return { status: "noop", pending: [], recorded: [], batch: null };
  }

  const names = pending.map((migration) => migration.name);
  if (options.dryRun) {
    return { status: "dry-run", pending: names, recorded: [], batch: null };
  }

  const batch = nextBatch(applied);
  const recorded: string[] = [];
  for (const migration of pending) {
    await store.runUp(migration);
    await store.record(migration.name, batch);
    recorded.push(migration.name);
  }

  return { status: "applied", pending: names, recorded, batch };
}

export function shouldApplyOnDeploy(env: DeployEnv): DeployApplyDecision {
  if (isTruthyFlag(env.SKIP_DB_MIGRATE)) {
    return { apply: false, fatal: false, reason: "SKIP_DB_MIGRATE is set" };
  }

  const onVercel = env.VERCEL === "1";
  const forced = isTruthyFlag(env.DB_APPLY_ON_DEPLOY);

  if (!onVercel && !forced) {
    return {
      apply: false,
      fatal: false,
      reason: "not a Vercel deploy (local/CI build)",
    };
  }

  if (!env.DATABASE_URL) {
    if (env.VERCEL_ENV === "production") {
      return {
        apply: false,
        fatal: true,
        reason:
          "DATABASE_URL is required to apply migrations on production deploy",
      };
    }
    return {
      apply: false,
      fatal: false,
      reason: "DATABASE_URL is unset; skipping migrate on preview",
    };
  }

  if (forced && !onVercel) {
    return { apply: true, fatal: false, reason: "DB_APPLY_ON_DEPLOY" };
  }

  const vercelEnv = env.VERCEL_ENV ?? "deploy";
  return { apply: true, fatal: false, reason: `Vercel ${vercelEnv}` };
}

export function formatApplyPendingLog(result: ApplyPendingResult): string {
  if (result.status === "noop") {
    return "Up to date — no pending migrations.";
  }
  if (result.status === "dry-run") {
    return `--dry-run: ${result.pending.length} pending migration(s): ${result.pending.join(", ")}`;
  }
  return `Applied + recorded ${result.recorded.length} migration(s) as batch ${result.batch}: ${result.recorded.join(", ")}`;
}
