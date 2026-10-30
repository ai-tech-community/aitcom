import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  updates: [] as unknown[],
}));
vi.mock("@/server/db", () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    for (const key of ["from", "where", "limit", "returning"])
      chain[key] = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve(result());
    return chain;
  };
  return {
    db: {
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
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
import { agentManagementRouter } from "./agent-management";
import { db } from "@/server/db";
const caller = (id = "owner") =>
  agentManagementRouter.createCaller({
    db,
    session: { user: { id } } as never,
    headers: new Headers(),
  });
const draft = {
  id: "d1",
  ownerId: "owner",
  agentId: "agent",
  type: "news_storyline" as string,
  status: "pending",
  metadata: {},
};
beforeEach(() => {
  draft.type = "news_storyline";
  state.rows = [[draft]];
  state.updates = [];
});
it("prevents generic approval from consuming a news proposal without editorial review", async () => {
  await expect(
    caller().reviewDraft({ draftId: "d1", action: "approved" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.updates).toEqual([]);
});
it("prevents generic approval from publishing a magazine issue", async () => {
  draft.type = "magazine_issue";
  await expect(
    caller().reviewDraft({ draftId: "d1", action: "approved" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(state.updates).toEqual([]);
});
it("retains the owner-only rejection boundary", async () => {
  await expect(
    caller("stranger").reviewDraft({ draftId: "d1", action: "rejected" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(state.updates).toEqual([]);
});
