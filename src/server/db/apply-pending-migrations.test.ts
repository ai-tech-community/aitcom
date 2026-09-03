import { describe, expect, it } from "vitest";

import {
  applyPendingMigrations,
  shouldApplyOnDeploy,
  type ApplyPendingStore,
  type ListedMigration,
} from "./apply-pending-migrations";

function memoryStore(
  initial: { name: string; batch?: string }[] = [],
): ApplyPendingStore & {
  applied: { name: string; batch?: string }[];
  ups: string[];
} {
  const applied = [...initial];
  const ups: string[] = [];
  return {
    applied,
    ups,
    async listApplied() {
      return [...applied];
    },
    async runUp(migration) {
      ups.push(migration.name);
    },
    async record(name, batch) {
      applied.push({ name, batch });
    },
  };
}

const hubDmMail: ListedMigration = {
  name: "20260831a_hub_dm_mail",
  async up() {
    /* recorded via store.runUp */
  },
};

describe("applyPendingMigrations", () => {
  it("is a no-op when every migration is already recorded", async () => {
    const store = memoryStore([{ name: "20260831a_hub_dm_mail", batch: "12" }]);

    const result = await applyPendingMigrations([hubDmMail], store);

    expect(result).toEqual({
      status: "noop",
      pending: [],
      recorded: [],
      batch: null,
    });
    expect(store.ups).toEqual([]);
    expect(store.applied).toEqual([
      { name: "20260831a_hub_dm_mail", batch: "12" },
    ]);
  });

  it("applies a pending migration and records it only once", async () => {
    const store = memoryStore([
      { name: "20260821a_member_hidden_from_public", batch: "11" },
    ]);

    const first = await applyPendingMigrations([hubDmMail], store);

    expect(first).toEqual({
      status: "applied",
      pending: ["20260831a_hub_dm_mail"],
      recorded: ["20260831a_hub_dm_mail"],
      batch: "12",
    });
    expect(store.ups).toEqual(["20260831a_hub_dm_mail"]);

    const second = await applyPendingMigrations([hubDmMail], store);

    expect(second.status).toBe("noop");
    expect(second.recorded).toEqual([]);
    expect(store.ups).toEqual(["20260831a_hub_dm_mail"]);
  });

  it("lists pending names on dry-run without applying or recording", async () => {
    const store = memoryStore();

    const result = await applyPendingMigrations([hubDmMail], store, {
      dryRun: true,
    });

    expect(result).toEqual({
      status: "dry-run",
      pending: ["20260831a_hub_dm_mail"],
      recorded: [],
      batch: null,
    });
    expect(store.ups).toEqual([]);
    expect(store.applied).toEqual([]);
  });
});

describe("shouldApplyOnDeploy", () => {
  it("skips local and CI builds that are not on Vercel", () => {
    expect(
      shouldApplyOnDeploy({
        DATABASE_URL:
          "postgresql://placeholder:placeholder@localhost:5432/placeholder",
      }),
    ).toEqual({
      apply: false,
      fatal: false,
      reason: "not a Vercel deploy (local/CI build)",
    });
  });

  it("applies on Vercel production when DATABASE_URL is set", () => {
    expect(
      shouldApplyOnDeploy({
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@ep-prod.neon.tech/neondb",
      }),
    ).toEqual({
      apply: true,
      fatal: false,
      reason: "Vercel production",
    });
  });

  it("skips Vercel preview by default even when DATABASE_URL is set", () => {
    expect(
      shouldApplyOnDeploy({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://user:pass@ep-prod.neon.tech/neondb",
      }),
    ).toEqual({
      apply: false,
      fatal: false,
      reason:
        "preview skipped (set DB_APPLY_ON_PREVIEW=1 only for an isolated preview DB)",
    });
  });

  it("applies on Vercel preview when DB_APPLY_ON_PREVIEW is set", () => {
    expect(
      shouldApplyOnDeploy({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://user:pass@ep-preview.neon.tech/neondb",
        DB_APPLY_ON_PREVIEW: "1",
      }),
    ).toEqual({
      apply: true,
      fatal: false,
      reason: "Vercel preview",
    });
  });

  it("fails production deploy when DATABASE_URL is missing", () => {
    expect(
      shouldApplyOnDeploy({
        VERCEL: "1",
        VERCEL_ENV: "production",
      }),
    ).toEqual({
      apply: false,
      fatal: true,
      reason:
        "DATABASE_URL is required to apply migrations on production deploy",
    });
  });

  it("skips opted-in preview when DATABASE_URL is missing", () => {
    expect(
      shouldApplyOnDeploy({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DB_APPLY_ON_PREVIEW: "1",
      }),
    ).toEqual({
      apply: false,
      fatal: false,
      reason: "DATABASE_URL is unset; skipping migrate on preview",
    });
  });

  it("honours SKIP_DB_MIGRATE even on Vercel production", () => {
    expect(
      shouldApplyOnDeploy({
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@ep-prod.neon.tech/neondb",
        SKIP_DB_MIGRATE: "1",
      }),
    ).toEqual({
      apply: false,
      fatal: false,
      reason: "SKIP_DB_MIGRATE is set",
    });
  });
});
