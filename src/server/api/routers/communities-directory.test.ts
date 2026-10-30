// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryCommunity } from "@/server/communities/directory";

const fake = vi.hoisted(() => ({ snapshot: vi.fn(), faces: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://app.test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/agent/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/server/communities/directory-queries", () => ({
  loadDirectorySnapshot: fake.snapshot,
  invalidateDirectorySnapshots: vi.fn(),
}));
vi.mock("@/server/communities/member-stack-queries", () => ({
  loadStackFacesForCommunities: fake.faces,
  loadStackFaces: vi.fn(),
}));

import { communitiesRouter } from "./communities";

function card(slug: string): DirectoryCommunity {
  return {
    id: slug,
    slug,
    name: slug === "ait" ? "AIT Community" : "Builders",
    description: null,
    logoUrl: null,
    joinPolicy: "open",
    createdAt: new Date("2026-01-01"),
    memberCount: 50,
    activeRecently: 0,
    newJoins: 0,
    score: 0,
    isNew: false,
    openRooms: 0,
    nextEvent: null,
    places: [],
    wants: [],
    points: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.snapshot.mockResolvedValue([card("ait"), card("builders")]);
  fake.faces.mockResolvedValue(
    new Map([
      [
        "ait",
        [{ userId: "hub-person", displayName: "Hub member", image: null }],
      ],
      [
        "builders",
        [
          {
            userId: "public-person",
            displayName: "Public member",
            image: null,
          },
        ],
      ],
    ]),
  );
});

describe("public AIT directory card", () => {
  it("returns AIT with its member count but never fetches or exposes its roster faces", async () => {
    const database = {};
    const caller = communitiesRouter.createCaller({
      db: database as never,
      session: null,
      headers: new Headers(),
    });
    const page = await caller.directory({ locale: "en" });
    expect(page.total).toBe(2);
    expect(page.items.find((row) => row.slug === "ait")).toMatchObject({
      name: "AIT Community",
      memberCount: 50,
      faces: [],
    });
    expect(fake.faces).toHaveBeenCalledWith(database, ["builders"]);
    expect(page.items.find((row) => row.slug === "builders")?.faces).toEqual([
      { userId: "public-person", displayName: "Public member", image: null },
    ]);
    expect(JSON.stringify(page)).not.toContain("hub-person");
  });

  it("keeps the AIT card reachable through name search", async () => {
    const caller = communitiesRouter.createCaller({
      db: {} as never,
      session: null,
      headers: new Headers(),
    });
    const page = await caller.directory({ q: "AIT Community", locale: "en" });
    expect(page.total).toBe(1);
    expect(page.items.map((row) => row.slug)).toEqual(["ait"]);
    expect(fake.faces).toHaveBeenCalledWith(expect.anything(), []);
  });
});
