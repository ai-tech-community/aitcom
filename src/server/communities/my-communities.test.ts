import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { HUB_SLUG } from "@/server/communities/hub";

import {
  hasActiveHubMembership,
  listMyCommunities,
  type MyCommunity,
} from "./my-communities";

/** Human member fixture — not an agent. */
const SOREN_ID = "soren-ravn";

function aitRow(over: Partial<MyCommunity> = {}): MyCommunity {
  return {
    communityId: "hub-ait",
    role: "member",
    status: "active",
    joinedAt: new Date("2026-08-20T00:00:00Z"),
    name: "AIT Community",
    slug: HUB_SLUG,
    description: "Hub root",
    logoUrl: null,
    autonomyLevel: "suggest",
    ...over,
  };
}

function makeDb(results: MyCommunity[][]) {
  let i = 0;
  return {
    select: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "innerJoin", "where", "orderBy"]) {
        chain[m] = () => chain;
      }
      chain.then = (
        resolve: (v: MyCommunity[]) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(results[i++] ?? []).then(resolve, reject);
      return chain;
    },
  };
}

describe("hasActiveHubMembership", () => {
  it("is true for an unlisted Hub root row", () => {
    expect(hasActiveHubMembership([aitRow()])).toBe(true);
  });

  it("is false when My Communities is empty", () => {
    expect(hasActiveHubMembership([])).toBe(false);
  });
});

describe("listMyCommunities (empty My Communities after email signup)", () => {
  it("returns the unlisted ait membership — it does not hide Hub", async () => {
    const db = makeDb([[aitRow()]]);
    const enroll = vi.fn(async () => true);

    const rows = await listMyCommunities(db as never, SOREN_ID, enroll);

    expect(rows).toEqual([aitRow()]);
    expect(enroll).not.toHaveBeenCalled();
  });

  it("enrols a new human signup when getMyCommunities would otherwise be empty", async () => {
    const created = aitRow();
    const db = makeDb([[], [created]]);
    const enroll = vi.fn(async () => true);

    const rows = await listMyCommunities(db as never, SOREN_ID, enroll);

    expect(enroll).toHaveBeenCalledWith(db, SOREN_ID);
    expect(rows).toEqual([created]);
    expect(rows.some((m) => m.slug === HUB_SLUG && m.status === "active")).toBe(
      true,
    );
  });

  it("does not treat a non-ait tenant as Hub enrolment", async () => {
    const tenant: MyCommunity = {
      ...aitRow(),
      communityId: "rotterdam",
      slug: "rotterdam",
      name: "Rotterdam",
    };
    const created = aitRow();
    const db = makeDb([[tenant], [created, tenant]]);
    const enroll = vi.fn(async () => true);

    const rows = await listMyCommunities(db as never, SOREN_ID, enroll);

    expect(enroll).toHaveBeenCalledWith(db, SOREN_ID);
    expect(rows.map((m) => m.slug)).toEqual([HUB_SLUG, "rotterdam"]);
  });

  it("query does not filter unlisted / hub roots (public directory does)", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "my-communities.ts"),
      "utf8",
    );
    expect(src).not.toContain("isListedInDirectory");
    const router = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../api/routers/communities.ts",
      ),
      "utf8",
    );
    expect(router).toContain("listMyCommunities(ctx.db, ctx.session.user.id)");
  });
});
