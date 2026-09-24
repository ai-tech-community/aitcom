// Router-level tests: writes to a post answer with its id, never the stored
// document (which carries the video's storage keys).
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = {
  membership: undefined as { role: string } | undefined,
};

const storedVideo = {
  key: "private/videos/c-1/u.mp4",
  thumbnailKey: "private/videos/c-1/u.jpg",
  storage: "private",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  bytes: 9,
};

const post = {
  id: 5,
  authorId: "u-1",
  communityId: "c-1",
  visibility: "community",
  hiddenAt: null,
  reportCount: 0,
  isDeleted: false,
  video: storedVideo,
};

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
};

const storage = { remove: vi.fn() };

vi.mock("@/server/db", () => ({
  db: {
    query: {
      communityMemberships: { findFirst: async () => hooks.membership },
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
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));
vi.mock("@/server/media/video-storage", () => ({
  getVideoStorage: () => storage,
}));

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
  hooks.membership = { role: "member" };
  payload.findByID.mockResolvedValue(post);
  payload.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...post,
      ...data,
    }),
  );
  storage.remove.mockResolvedValue(undefined);
});

describe("feed post writes", () => {
  it("editPost answers with the id only", async () => {
    const result = await caller().feed.editPost({ postId: 5, content: "New" });
    expect(result).toEqual({ id: 5 });
    expect(JSON.stringify(result)).not.toMatch(/key|thumbnailKey/);
  });

  it("deletePost answers with the id only", async () => {
    const result = await caller().feed.deletePost({ postId: 5 });
    expect(result).toEqual({ id: 5 });
    expect(JSON.stringify(result)).not.toMatch(/key|thumbnailKey/);
    expect(storage.remove).toHaveBeenCalledWith([
      storedVideo.key,
      storedVideo.thumbnailKey,
    ]);
  });
});
