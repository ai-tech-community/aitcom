import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HUB_DESCRIPTION, HUB_NAME, HUB_SLUG } from "@/server/communities/hub";

import {
  backfillHubEnrollment,
  enrollInHub,
  ensureHub,
  reclassifyAitAsAnchor,
} from "./enroll-in-hub";

/** Human member fixture — not an agent. */
const SOREN_ID = "soren-ravn";

function isHubInsert(v: unknown): v is { slug: string } {
  return !!v && typeof v === "object" && "slug" in v;
}

function makeEnrollDb(opts: { hubId?: string; deletedAt?: Date | null } = {}) {
  let hub = opts.hubId
    ? { id: opts.hubId, deletedAt: opts.deletedAt ?? null }
    : undefined;
  const communityInserts: unknown[] = [];
  const membershipInserts: unknown[] = [];
  const updates: unknown[] = [];

  const db = {
    query: {
      communities: {
        findFirst: async () => hub,
      },
    },
    insert: () => ({
      values: (v: unknown) => {
        if (isHubInsert(v)) {
          communityInserts.push(v);
          const id = "hub-ait-created";
          hub = { id, deletedAt: null };
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ id }],
            }),
          };
        }
        membershipInserts.push(v);
        return {
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
    update: () => ({
      set: (set: unknown) => {
        updates.push(set);
        if (hub) hub = { ...hub, deletedAt: null };
        return { where: async () => undefined };
      },
    }),
  };
  return {
    db,
    communityInserts,
    membershipInserts,
    updates,
    getHub: () => hub,
  };
}

function makeBackfillDb(opts: {
  hubId?: string;
  users: string[];
  already: string[];
}) {
  const inserted: unknown[] = [];
  let selectCalls = 0;
  const db = {
    query: {
      communities: {
        findFirst: async () => (opts.hubId ? { id: opts.hubId } : undefined),
      },
    },
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where", "limit"]) chain[m] = () => chain;
      chain.then = (
        resolve: (v: unknown[]) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        selectCalls += 1;
        const rows =
          selectCalls === 1
            ? opts.already.map((userId) => ({ userId }))
            : opts.users
                .filter((id) => !opts.already.includes(id))
                .map((id) => ({ id }));
        return Promise.resolve(rows).then(resolve, reject);
      };
      return chain;
    },
    insert: () => ({
      values: (v: unknown) => {
        inserted.push(v);
        const rows: unknown[] = Array.isArray(v) ? [...v] : [v];
        return {
          onConflictDoNothing: () => ({
            returning: async () => rows,
          }),
        };
      },
    }),
  };
  return { db, inserted };
}

function makeReclassifyDb(opts: { hubId?: string; privileged: string[] }) {
  const sets: unknown[] = [];
  const db = {
    query: {
      communities: {
        findFirst: async () => (opts.hubId ? { id: opts.hubId } : undefined),
      },
    },
    update: () => ({
      set: (set: unknown) => {
        sets.push(set);
        return {
          where: () => ({
            returning: async () =>
              opts.privileged.map((userId) => ({ userId })),
            then: (
              resolve: (v: unknown) => unknown,
              reject?: (e: unknown) => unknown,
            ) => Promise.resolve(undefined).then(resolve, reject),
          }),
        };
      },
    }),
  };
  return { db, sets };
}

function makeMissingHubBackfillDb(users: string[]) {
  let hub: { id: string } | undefined;
  const communityInserts: unknown[] = [];
  const membershipInserts: unknown[] = [];
  let selectCalls = 0;

  const db = {
    query: {
      communities: {
        findFirst: async () => hub,
      },
    },
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where", "limit"]) chain[m] = () => chain;
      chain.then = (
        resolve: (v: unknown[]) => unknown,
        reject?: (e: unknown) => unknown,
      ) => {
        selectCalls += 1;
        // ensureHub firstUserId, then already-members, then missing users
        const rows =
          selectCalls === 1
            ? users.slice(0, 1).map((id) => ({ id }))
            : selectCalls === 2
              ? []
              : users.map((id) => ({ id }));
        return Promise.resolve(rows).then(resolve, reject);
      };
      return chain;
    },
    insert: () => ({
      values: (v: unknown) => {
        if (isHubInsert(v)) {
          communityInserts.push(v);
          hub = { id: "hub-ait-created" };
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ id: hub!.id }],
            }),
          };
        }
        membershipInserts.push(v);
        const rows: unknown[] = Array.isArray(v) ? [...v] : [v];
        return {
          onConflictDoNothing: () => ({
            returning: async () => rows,
          }),
        };
      },
    }),
  };
  return { db, communityInserts, membershipInserts };
}

describe("Hub enrolment on signup (ADR-0019)", () => {
  it("gives a newly created human user an active ait membership", async () => {
    const { db, membershipInserts, communityInserts } = makeEnrollDb({
      hubId: "hub-ait",
    });

    const ok = await enrollInHub(db as never, SOREN_ID);

    expect(ok).toBe(true);
    expect(communityInserts).toEqual([]);
    expect(membershipInserts).toEqual([
      {
        communityId: "hub-ait",
        userId: SOREN_ID,
        role: "member",
        status: "active",
      },
    ]);
  });

  it("creates the unlisted Hub root when ait is absent, then enrols the human", async () => {
    const { db, communityInserts, membershipInserts } = makeEnrollDb();

    const ok = await enrollInHub(db as never, SOREN_ID);

    expect(ok).toBe(true);
    expect(communityInserts).toEqual([
      {
        name: HUB_NAME,
        slug: HUB_SLUG,
        description: HUB_DESCRIPTION,
        joinPolicy: "open",
        isListedInDirectory: false,
        createdBy: SOREN_ID,
      },
    ]);
    expect(membershipInserts).toEqual([
      {
        communityId: "hub-ait-created",
        userId: SOREN_ID,
        role: "member",
        status: "active",
      },
    ]);
  });

  it("Better Auth user.create.after enrols the user in the Hub", () => {
    const configPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../better-auth/config.ts",
    );
    const src = readFileSync(configPath, "utf8");
    expect(src).toContain('from "@/server/db/enroll-on-auth"');
    expect(src).toContain("enrollForCreatedUser(user)");
  });
});

describe("ensureHub", () => {
  it("is a no-op when the Hub row already exists", async () => {
    const { db, communityInserts } = makeEnrollDb({ hubId: "hub-ait" });
    const hub = await ensureHub(db as never, SOREN_ID);
    expect(hub).toEqual({ id: "hub-ait" });
    expect(communityInserts).toEqual([]);
  });

  it("restores a soft-deleted ait row and keeps it unlisted", async () => {
    const { db, communityInserts, updates } = makeEnrollDb({
      hubId: "hub-ait",
      deletedAt: new Date("2026-08-01T00:00:00Z"),
    });

    const hub = await ensureHub(db as never, SOREN_ID);

    expect(hub).toEqual({ id: "hub-ait" });
    expect(communityInserts).toEqual([]);
    expect(updates).toContainEqual({
      deletedAt: null,
      isListedInDirectory: false,
    });
  });
});

describe("backfillHubEnrollment", () => {
  it("enrols every user who lacks an ait membership", async () => {
    const { db, inserted } = makeBackfillDb({
      hubId: "hub-ait",
      users: [SOREN_ID, "already-in"],
      already: ["already-in"],
    });

    const { enrolled } = await backfillHubEnrollment(db as never);

    expect(enrolled).toBe(1);
    expect(inserted).toEqual([
      [
        {
          communityId: "hub-ait",
          userId: SOREN_ID,
          role: "member",
          status: "active",
        },
      ],
    ]);
  });

  it("re-running the backfill is a no-op", async () => {
    const run = async () => {
      const { db, inserted } = makeBackfillDb({
        hubId: "hub-ait",
        users: [SOREN_ID, "already-in"],
        already: [SOREN_ID, "already-in"],
      });
      return {
        result: await backfillHubEnrollment(db as never),
        inserted,
      };
    };

    const first = await run();
    const second = await run();

    expect(first.result).toEqual({ enrolled: 0 });
    expect(second.result).toEqual({ enrolled: 0 });
    expect(first.inserted).toEqual([]);
    expect(second.inserted).toEqual([]);
  });

  it("creates the Hub when ait is missing, then enrols every user", async () => {
    const { db, communityInserts, membershipInserts } =
      makeMissingHubBackfillDb([SOREN_ID]);

    const { enrolled } = await backfillHubEnrollment(db as never);

    expect(communityInserts).toEqual([
      {
        name: HUB_NAME,
        slug: HUB_SLUG,
        description: HUB_DESCRIPTION,
        joinPolicy: "open",
        isListedInDirectory: false,
        createdBy: SOREN_ID,
      },
    ]);
    expect(enrolled).toBe(1);
    expect(membershipInserts).toEqual([
      [
        {
          communityId: "hub-ait-created",
          userId: SOREN_ID,
          role: "member",
          status: "active",
        },
      ],
    ]);
  });
});

describe("reclassifyAitAsAnchor", () => {
  it("unlists ait and demotes privileged roles to member", async () => {
    const { db, sets } = makeReclassifyDb({
      hubId: "hub-ait",
      privileged: ["legacy-owner"],
    });

    const result = await reclassifyAitAsAnchor(db as never);

    expect(result).toEqual({ unlisted: true, demoted: 1 });
    expect(sets).toContainEqual({ isListedInDirectory: false });
    expect(sets).toContainEqual({ role: "member" });
  });
});
