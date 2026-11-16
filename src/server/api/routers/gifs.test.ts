// Router-level tests: GIF search is open to every signed-in member, with
// a per-member limit so one member cannot use up GIPHY for everyone.
import { beforeEach, describe, expect, it, vi } from "vitest";

const gif = {
  giphyId: "abc123",
  title: "Party parrot",
  mp4Url: "https://media.giphy.com/media/abc123/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/abc123/giphy_s.gif",
  width: 400,
  height: 300,
  preview: {
    mp4Url: "https://media.giphy.com/media/abc123/200w.mp4",
    stillUrl: "https://media.giphy.com/media/abc123/200w_s.gif",
    width: 200,
    height: 150,
  },
};
const giphy = {
  byId: vi.fn(),
  search: vi.fn(),
  trending: vi.fn(),
};

vi.mock("@/server/db", () => ({
  db: {
    query: {
      // A member of no community at all.
      communityMemberships: {
        findFirst: async () => undefined,
        findMany: async () => [],
      },
      communities: { findFirst: async () => undefined },
    },
  },
}));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
// The app router pulls in Payload; GIF search never reaches it.
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => {
    throw new Error("GIF search must not touch Payload");
  },
}));
vi.mock("@/server/giphy/giphy", () => ({ getGiphyClient: () => giphy }));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller(userId = "u-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId } } as never,
    headers: new Headers(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  giphy.trending.mockResolvedValue({ gifs: [gif], nextOffset: 24 });
  giphy.search.mockResolvedValue({ gifs: [gif], nextOffset: null });
});

describe("gifs.search", () => {
  it("search returns trending without a query", async () => {
    await expect(caller().gifs.search({})).resolves.toEqual({
      gifs: [gif],
      nextCursor: 24,
    });
    expect(giphy.trending).toHaveBeenCalledWith({ offset: 0 });
    expect(giphy.search).not.toHaveBeenCalled();
  });

  it("search passes the trimmed query and language", async () => {
    await expect(
      caller().gifs.search({ query: "  cat ", lang: "fr" }),
    ).resolves.toEqual({ gifs: [gif], nextCursor: null });
    expect(giphy.search).toHaveBeenCalledWith({
      query: "cat",
      offset: 0,
      lang: "fr",
    });
    await caller().gifs.search({ query: "cat", cursor: 24 });
    expect(giphy.search).toHaveBeenLastCalledWith({
      query: "cat",
      offset: 24,
      lang: "en",
    });
  });

  it("search needs no community", async () => {
    // The mocked db has no membership for this member anywhere.
    await expect(
      caller("member-of-nothing").gifs.search({ query: "hello" }),
    ).resolves.toEqual({ gifs: [gif], nextCursor: null });
  });

  it("search refuses the 61st call in an hour", async () => {
    const heavy = caller("gif-heavy-user");
    for (let i = 0; i < 60; i++) {
      await heavy.gifs.search({});
    }
    await expect(heavy.gifs.search({})).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    await expect(caller("someone-else").gifs.search({})).resolves.toBeDefined();
  }, 30_000);

  it("search refuses a signed-out caller", async () => {
    const signedOut = createCaller({
      db: mockedDb,
      session: null,
      headers: new Headers(),
    });
    await expect(signedOut.gifs.search({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(giphy.trending).not.toHaveBeenCalled();
  });
});
