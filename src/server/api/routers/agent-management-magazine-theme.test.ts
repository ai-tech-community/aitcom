import { beforeEach, expect, it, vi } from "vitest";
import type * as Editorship from "@/server/magazines/editorship";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  updates: [] as unknown[],
  themes: [] as unknown[],
  role: "editor_in_chief" as "editor_in_chief" | "editor" | null,
}));

vi.mock("@/server/db", () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const key of [
      "from",
      "where",
      "limit",
      "returning",
      "leftJoin",
      "orderBy",
    ])
      chain[key] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve(result());
    return chain;
  };
  return {
    db: {
      query: { communities: { findFirst: async () => ({ id: "community" }) } },
      select: () => query(() => state.rows.shift() ?? []),
      update: () => ({
        set: (value: unknown) =>
          query(() => {
            state.updates.push(value);
            return state.rows.shift() ?? [];
          }),
      }),
    },
  };
});
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_APP_URL: "https://example.org",
    DATABASE_URL: "postgres://localhost:1/none",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    findByID: async () => ({ id: 7, communityId: "community" }),
    update: async (args: unknown) => {
      state.themes.push(args);
    },
  }),
}));

vi.mock("@/server/magazines/editorship", async (importOriginal) => {
  const actual = await importOriginal<typeof Editorship>();
  return {
    ...actual,
    loadMagazineEditorship: async () =>
      actual.standingOf(state.role ? "member" : null, state.role),
  };
});

import { agentManagementRouter } from "./agent-management";
import { db } from "@/server/db";

const caller = (id = "owner") =>
  agentManagementRouter.createCaller({
    db,
    session: { user: { id } } as never,
    headers: new Headers(),
  });

const draft = {
  id: "theme-1",
  ownerId: "owner",
  agentId: "agent",
  type: "magazine_theme",
  status: "pending",
  content: "Theme fashion, accent #9A3412.",
  metadata: {
    magazineId: 7,
    fontPair: "fashion",
    accent: "#9A3412",
  },
};

beforeEach(() => {
  draft.metadata = {
    magazineId: 7,
    fontPair: "fashion",
    accent: "#9A3412",
  };
  state.rows = [[draft], [], [{ ...draft, status: "approved" }]];
  state.role = "editor_in_chief";
  state.updates = [];
  state.themes = [];
});

it("applies a magazine theme only after the owner approves the draft", async () => {
  await caller().reviewDraft({ draftId: "theme-1", action: "approved" });
  expect(state.updates).toEqual([{ status: "approved" }]);
  expect(state.themes).toEqual([
    {
      collection: "magazines",
      id: 7,
      depth: 0,
      data: { themeFontPair: "fashion", themeAccent: "#9A3412" },
    },
  ]);
});

it("leaves an invalid theme draft pending", async () => {
  draft.metadata = { magazineId: 7, fontPair: "comic", accent: "#888888" };
  state.rows = [[draft]];
  await expect(
    caller().reviewDraft({ draftId: "theme-1", action: "approved" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.updates).toEqual([]);
  expect(state.themes).toEqual([]);
});

it.each(["editor", null] as const)(
  "refuses theme approval after manage capability is lost (%s)",
  async (role) => {
    state.role = role;
    await expect(
      caller().reviewDraft({ draftId: "theme-1", action: "approved" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.updates).toEqual([]);
    expect(state.themes).toEqual([]);
  },
);
