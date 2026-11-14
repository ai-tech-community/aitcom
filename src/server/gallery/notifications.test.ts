import { describe, expect, it, vi } from "vitest";

import { notifications } from "@/server/db/schema";

import {
  GALLERY_ITEM_REPORTED_NOTIFICATION,
  GALLERY_ITEM_THIS_IS_ME_NOTIFICATION,
  galleryReportNotices,
  notifyGalleryItemReported,
  notifyUploaderThisIsMe,
} from "./notifications";

function fakeDb(
  input: {
    community?: { slug: string; name: string } | null;
    moderators?: string[];
  } = {},
) {
  const inserted: Record<string, unknown>[] = [];
  const tables: unknown[] = [];
  const community =
    input.community === undefined
      ? { slug: "town", name: "Town Square" }
      : input.community;
  const db = {
    query: {
      communities: { findFirst: vi.fn(async () => community ?? undefined) },
    },
    select: vi.fn(() => ({
      from: () => ({
        where: async () =>
          (input.moderators ?? ["m1", "m2"]).map((userId) => ({ userId })),
      }),
    })),
    insert: vi.fn((table: unknown) => {
      tables.push(table);
      return {
        values: async (rows: Record<string, unknown>[]) => {
          inserted.push(...rows);
        },
      };
    }),
  };
  return { db: db as never, raw: db, inserted, tables };
}

describe("notifyGalleryItemReported", () => {
  it("tells each moderator once, with a link to review the item", async () => {
    const { db, inserted, tables } = fakeDb();

    await notifyGalleryItemReported(db, { communityId: "c1", itemId: 42 });

    expect(tables).toEqual([notifications]);
    const notice = {
      type: GALLERY_ITEM_REPORTED_NOTIFICATION,
      title: "A photo or video was reported",
      content:
        "A photo or video in **Town Square** was reported and is hidden until you review it.",
      communityId: "c1",
      metadata: {
        itemId: 42,
        reviewPath: "/communities/town/gallery?item=42",
        linkLabel: "Review it",
      },
    };
    expect(inserted).toEqual([
      { userId: "m1", ...notice },
      { userId: "m2", ...notice },
    ]);
    expect(GALLERY_ITEM_REPORTED_NOTIFICATION).toBe("gallery_item_reported");
  });

  it("writes nothing when nobody moderates the community", async () => {
    const { db, raw } = fakeDb({ moderators: [] });
    await notifyGalleryItemReported(db, { communityId: "c1", itemId: 42 });
    expect(raw.insert).not.toHaveBeenCalled();
  });

  it("writes nothing when the community is gone", async () => {
    const { db, raw } = fakeDb({ community: null });
    await notifyGalleryItemReported(db, { communityId: "c1", itemId: 42 });
    expect(raw.insert).not.toHaveBeenCalled();
    expect(raw.select).not.toHaveBeenCalled();
  });
});

describe("notifyUploaderThisIsMe", () => {
  it("tells the uploader someone asked to be removed, with a link to the item", async () => {
    const { db, inserted, raw } = fakeDb();

    await notifyUploaderThisIsMe(db, {
      communityId: "c1",
      itemId: 42,
      uploaderId: "u1",
    });

    expect(raw.select).not.toHaveBeenCalled();
    expect(inserted).toEqual([
      {
        userId: "u1",
        type: GALLERY_ITEM_THIS_IS_ME_NOTIFICATION,
        title: "Someone asked to be removed from your photo or video",
        content:
          "Someone says they are in a photo or video you added to **Town Square** and asked to be removed. It is hidden while moderators review it. You can also delete it yourself.",
        communityId: "c1",
        metadata: {
          itemId: 42,
          reviewPath: "/communities/town/gallery?item=42",
          linkLabel: "See it",
        },
      },
    ]);
    expect(GALLERY_ITEM_THIS_IS_ME_NOTIFICATION).toBe(
      "gallery_item_this_is_me",
    );
  });

  it("writes nothing when the community is gone", async () => {
    const { db, raw } = fakeDb({ community: null });
    await notifyUploaderThisIsMe(db, {
      communityId: "c1",
      itemId: 42,
      uploaderId: "u1",
    });
    expect(raw.insert).not.toHaveBeenCalled();
  });
});

describe("galleryReportNotices", () => {
  it("sends the report service's notices through this database", async () => {
    const { db, inserted } = fakeDb({ moderators: ["m1"] });
    const notify = galleryReportNotices(db);

    await notify.itemReported({ communityId: "c1", itemId: 7 });
    await notify.uploaderThisIsMe({
      communityId: "c1",
      itemId: 7,
      uploaderId: "u1",
    });

    expect(inserted.map((row) => [row.userId, row.type])).toEqual([
      ["m1", "gallery_item_reported"],
      ["u1", "gallery_item_this_is_me"],
    ]);
  });
});
