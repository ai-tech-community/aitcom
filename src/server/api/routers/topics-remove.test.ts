import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  calls: [] as string[],
  update: vi.fn(),
  delete: vi.fn(),
  findByID: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: {} }));
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
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    findByID: m.findByID,
    update: m.update,
    delete: m.delete,
  }),
}));

const { createCaller } = await import("@/server/api/root");

function caller(role: string) {
  return createCaller({
    db: {
      query: {
        communityMemberships: {
          findFirst: async () => ({ role, status: "active" }),
        },
      },
    } as never,
    session: {
      user: { id: "owner-1", name: "Ada", email: "ada@example.com" },
      session: { id: "session-1" },
    } as never,
    headers: new Headers(),
  });
}

beforeEach(() => {
  m.calls.length = 0;
  vi.clearAllMocks();
  m.findByID.mockResolvedValue({
    id: 4,
    communityId: "c1",
    slug: "outings",
    isDefault: false,
  });
  m.update.mockImplementation(
    async ({ collection }: { collection: string }) => {
      m.calls.push(`update ${collection}`);
      return { docs: [], errors: [] };
    },
  );
  m.delete.mockImplementation(
    async ({ collection }: { collection: string }) => {
      m.calls.push(`delete ${collection}`);
      return {};
    },
  );
});

describe("topics.remove", () => {
  it("clears the gallery category of the topic's items and batches before deleting it", async () => {
    await caller("owner").topics.remove({ id: 4 });
    const inTopic = {
      and: [
        { communityId: { equals: "c1" } },
        { topicSlug: { equals: "outings" } },
      ],
    };
    expect(m.update).toHaveBeenCalledWith({
      collection: "gallery-items",
      where: inTopic,
      data: { topicSlug: null },
    });
    expect(m.update).toHaveBeenCalledWith({
      collection: "gallery-batches",
      where: inTopic,
      data: { topicSlug: null },
    });
    expect(m.update).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: inTopic,
      data: { topicSlug: "general" },
    });
    expect(m.calls.at(-1)).toBe("delete community-topics");
  });

  it("keeps the topic when its gallery items could not be moved", async () => {
    m.update.mockImplementation(
      async ({ collection }: { collection: string }) => ({
        docs: [],
        errors:
          collection === "gallery-items" ? [{ id: 1, message: "no" }] : [],
      }),
    );
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      caller("admin").topics.remove({ id: 4 }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(m.delete).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("refuses a plain member before touching any content", async () => {
    await expect(
      caller("member").topics.remove({ id: 4 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.update).not.toHaveBeenCalled();
  });
});
