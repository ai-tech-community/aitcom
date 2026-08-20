import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  backfillHubEnrollment,
  enrollInHub,
  reclassifyAitAsAnchor,
} from "./enroll-in-hub";

/** Human member fixture — not an agent. */
const SOREN_ID = "soren-ravn";

function makeEnrollDb(hubId: string | undefined) {
  const inserts: unknown[] = [];
  const db = {
    query: {
      communities: {
        findFirst: async () => (hubId ? { id: hubId } : undefined),
      },
    },
    insert: () => ({
      values: (v: unknown) => {
        inserts.push(v);
        return {
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
  };
  return { db, inserts };
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
      for (const m of ["from", "where"]) chain[m] = () => chain;
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

describe("Hub enrolment on signup (ADR-0019)", () => {
  it("gives a newly created human user an active ait membership", async () => {
    const { db, inserts } = makeEnrollDb("hub-ait");

    const ok = await enrollInHub(db as never, SOREN_ID);

    expect(ok).toBe(true);
    expect(inserts).toEqual([
      {
        communityId: "hub-ait",
        userId: SOREN_ID,
        role: "member",
        status: "active",
      },
    ]);
  });

  it("is a no-op when the Hub row has not been seeded yet", async () => {
    const { db, inserts } = makeEnrollDb(undefined);
    const ok = await enrollInHub(db as never, SOREN_ID);
    expect(ok).toBe(false);
    expect(inserts).toEqual([]);
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

  it("throws when the Hub row is missing", async () => {
    const { db } = makeBackfillDb({
      users: [SOREN_ID],
      already: [],
    });
    await expect(backfillHubEnrollment(db as never)).rejects.toThrow(/ait/);
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
