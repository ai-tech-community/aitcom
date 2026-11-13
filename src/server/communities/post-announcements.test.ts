import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/notifications/broadcast-send", () => ({
  sendCommunityBroadcast: vi.fn(async () => undefined),
}));

import { sendCommunityBroadcast } from "@/server/notifications/broadcast-send";

import {
  announceToEveryone,
  feedPostAnnouncementAfterChange,
} from "./post-announcements";

type Database = Parameters<typeof announceToEveryone>[0];

/** An admin of a live community: everything `announceToEveryone` reads. */
function adminDatabase() {
  const memberships = vi.fn(async () => ({ role: "admin" }));
  const community = vi.fn(async () => ({ slug: "makers", name: "Makers" }));
  const database = {
    query: {
      communityMemberships: { findFirst: memberships },
      communities: { findFirst: community },
    },
  } as unknown as Database;
  return { database, memberships, community };
}

const adminPost = {
  id: 41,
  authorId: "admin-1",
  authorName: "Ada",
  communityId: "c-1",
  content: "thanks @everyone",
};

describe("announceToEveryone", () => {
  it("announces an admin's @everyone on a written post", async () => {
    const { database } = adminDatabase();
    const claim = vi.fn(async () => true);
    const announcement = await announceToEveryone(database, adminPost, claim);
    expect(announcement).toMatchObject({ communityId: "c-1" });
    expect(claim).toHaveBeenCalledWith(41);
  });

  it("never broadcasts a gallery post, even an admin's @everyone", async () => {
    const { database, memberships } = adminDatabase();
    const claim = vi.fn(async () => true);
    for (const galleryBatch of [7, { id: 7 }]) {
      const announcement = await announceToEveryone(
        database,
        { ...adminPost, galleryBatch },
        claim,
      );
      expect(announcement).toBeNull();
    }
    expect(claim).not.toHaveBeenCalled();
    expect(memberships).not.toHaveBeenCalled();
  });
});

describe("feedPostAnnouncementAfterChange", () => {
  it("sends nothing for a new gallery post that says @everyone", async () => {
    const { database } = adminDatabase();
    const hook = feedPostAnnouncementAfterChange(async () => database);
    const execute = vi.fn(async () => ({ rows: [{ id: 41 }] }));
    const req = {
      context: {} as Record<string, unknown>,
      payload: { db: { drizzle: { execute }, sessions: {} } },
    };
    await hook({
      doc: { ...adminPost, galleryBatch: 7 },
      req,
      operation: "create",
    } as never);
    expect(execute).not.toHaveBeenCalled();
    expect(sendCommunityBroadcast).not.toHaveBeenCalled();
    expect(req.context).toEqual({});
  });
});
