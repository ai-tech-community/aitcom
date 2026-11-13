import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { ValidationError } from "payload";
import { describe, expect, it, vi } from "vitest";

import { DELETED_AUTHOR_ID } from "@/lib/account-deletion";
import { GALLERY_REVIEW_REPORTS_MAX } from "@/lib/gallery-report-reasons";
import {
  matchesWhere,
  selectFields,
  sortDocs,
} from "@/test/fake-payload-query";

import type { GalleryViewer } from "./access";
import { listItemReports, reportItem, reviewItemReports } from "./reports";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 60 * 60 * 1000;

type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;

function item(id: number, over: Doc = {}): Doc {
  return {
    id,
    communityId: "c1",
    mediaType: "photo",
    status: "ready",
    storage: "private",
    visibility: "community",
    fileKey: `private/gallery/c1/u${id}.jpg`,
    thumbnailKey: `private/gallery/c1/u${id}-thumb.jpg`,
    width: 800,
    height: 600,
    uploaderId: "u1",
    batch: 3,
    hiddenAt: null,
    reportCount: 0,
    createdAt: ago(HOUR),
    ...over,
  };
}

function report(id: number, over: Doc = {}): Doc {
  return {
    id,
    item: 1,
    reporterId: `r${id}`,
    reason: "spam",
    note: null,
    dismissedAt: null,
    createdAt: ago(HOUR - id * 1000),
    ...over,
  };
}

/** The rendered statement a fake `execute` was handed. */
function rendered(query: SQL) {
  return new PgDialect().sqlToQuery(query);
}

/**
 * A fake Payload over an in-memory store. The two single-statement claims
 * (hiding an item, removing an empty gallery post) are run against the
 * store as their WHERE clauses say, so a guarded write really is guarded.
 */
function fakes(seed: { items?: Doc[]; reports?: Doc[]; posts?: Doc[] } = {}) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [item(1)],
    "gallery-reports": seed.reports ?? [],
    "feed-posts": seed.posts ?? [],
    "gallery-batches": [{ id: 3, communityId: "c1", feedPostId: 40 }],
  };
  let nextReportId = 100;
  const rows = (collection: string) => store[collection] ?? [];
  const execute = vi.fn(async (query: SQL) => {
    const { sql, params } = rendered(query);
    if (sql.includes('"gallery_items"')) {
      const [at, id] = params as [string, number];
      const row = rows("gallery-items").find(
        (doc) => doc.id === id && doc.hiddenAt == null,
      );
      if (!row) return { rows: [] };
      row.hiddenAt = at;
      return { rows: [{ id }] };
    }
    if (sql.includes('"feed_posts"')) {
      const [postId] = params as [number];
      const post = rows("feed-posts").find((doc) => doc.id === postId);
      if (!post || post.isDeleted) return { rows: [] };
      Object.assign(post, { isDeleted: true, galleryBatch: null });
      return { rows: [{ id: postId }] };
    }
    throw new Error(`unexpected statement: ${sql}`);
  });
  const payload = {
    find: vi.fn(
      async (args: {
        collection: string;
        where?: Where;
        sort?: string;
        limit?: number;
        select?: Doc;
      }) => {
        const found = sortDocs(
          rows(args.collection).filter((doc) => matchesWhere(doc, args.where)),
          args.sort,
        ).map((doc) => selectFields(doc, args.select));
        return { docs: args.limit ? found.slice(0, args.limit) : found };
      },
    ),
    count: vi.fn(async (args: { collection: string; where?: Where }) => ({
      totalDocs: rows(args.collection).filter((doc) =>
        matchesWhere(doc, args.where),
      ).length,
    })),
    create: vi.fn(async (args: { collection: string; data: Doc }) => {
      if (args.collection !== "gallery-reports") throw new Error("no");
      const duplicate = rows("gallery-reports").some(
        (doc) =>
          doc.item === args.data.item &&
          doc.reporterId === args.data.reporterId,
      );
      if (duplicate) {
        throw new ValidationError({
          collection: "gallery-reports",
          errors: [{ message: "Value must be unique", path: "reporterId" }],
        });
      }
      const doc = {
        id: nextReportId++,
        dismissedAt: null,
        createdAt: NOW.toISOString(),
        ...args.data,
      };
      store["gallery-reports"]!.push(doc);
      return doc;
    }),
    update: vi.fn(
      async (args: {
        collection: string;
        id?: number;
        where?: Where;
        data: Doc;
      }) => {
        const list = rows(args.collection);
        const docs: Doc[] = [];
        list.forEach((doc, index) => {
          const hit =
            args.id === undefined
              ? matchesWhere(doc, args.where)
              : doc.id === args.id;
          if (!hit) return;
          list[index] = { ...doc, ...args.data };
          docs.push(list[index]);
        });
        return { docs, errors: [] as unknown[] };
      },
    ),
    delete: vi.fn(async (args: { collection: string; where: Where }) => {
      const gone = rows(args.collection).filter((doc) =>
        matchesWhere(doc, args.where),
      );
      store[args.collection] = rows(args.collection).filter(
        (doc) => !gone.includes(doc),
      );
      return { docs: gone, errors: [] as unknown[] };
    }),
    db: { drizzle: { execute } },
  };
  const storage = { remove: vi.fn(async () => undefined) };
  const notify = {
    itemReported: vi.fn(async () => undefined),
    uploaderThisIsMe: vi.fn(async () => undefined),
  };
  const log = vi.fn();
  const deps = {
    payload: payload as never,
    db: {} as never,
    storage: (() => storage) as never,
    now: () => NOW,
    log,
    notify,
  };
  return { deps, payload, execute, storage, notify, log, store };
}

function viewer(over: Partial<GalleryViewer> = {}): GalleryViewer {
  return {
    userId: "u2",
    communityId: "c1",
    isMember: true,
    isModerator: false,
    canSeePublic: true,
    ...over,
  };
}
const member = (userId = "u2") => viewer({ userId });
const moderator = (userId = "u3") => viewer({ userId, isModerator: true });
const outsider = (userId: string | null = "u9", canSeePublic = true) =>
  viewer({ userId, isMember: false, canSeePublic });

const reportsOf = (store: Record<string, Doc[]>) => store["gallery-reports"]!;
const itemRow = (store: Record<string, Doc[]>, id = 1) =>
  store["gallery-items"]!.find((doc) => doc.id === id);

describe("reportItem — Review Focus 1: only what the reporter may read", () => {
  it.each([
    [
      "a hidden item, by a member who didn't add it",
      [item(1, { hiddenAt: ago(HOUR) })],
      member(),
    ],
    ["a members-only item, by a signed-in outsider", [item(1)], outsider()],
    [
      "a public item of a community outsiders may not read",
      [item(1, { visibility: "public" })],
      outsider("u9", false),
    ],
    [
      "a hidden public item, by an outsider",
      [item(1, { visibility: "public", hiddenAt: ago(HOUR) })],
      outsider(),
    ],
    [
      "another community's item",
      [item(1, { communityId: "c2", visibility: "public" })],
      member(),
    ],
    ["an item still uploading", [item(1, { status: "uploading" })], member()],
    ["an item that does not exist", [], member()],
  ])("answers NOT_FOUND for %s, and writes nothing", async (_, items, who) => {
    const { deps, execute, notify, store } = fakes({ items });
    await expect(
      reportItem(deps, { viewer: who, itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(reportsOf(store)).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
    expect(notify.itemReported).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor, even on a public item", async () => {
    const { deps, store } = fakes({
      items: [item(1, { visibility: "public" })],
    });
    await expect(
      reportItem(deps, { viewer: outsider(null), itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(reportsOf(store)).toEqual([]);
  });

  it("lets a signed-in outsider report a public item they can see", async () => {
    const { deps, store, notify } = fakes({
      items: [item(1, { visibility: "public" })],
    });
    await expect(
      reportItem(deps, {
        viewer: outsider("u9"),
        itemId: 1,
        reason: "this_is_me",
      }),
    ).resolves.toEqual({ hidden: true });
    expect(reportsOf(store)).toHaveLength(1);
    expect(itemRow(store)!.hiddenAt).toBe(NOW.toISOString());
    expect(notify.uploaderThisIsMe).toHaveBeenCalledTimes(1);
  });
});

describe("reportItem — the report and the hide", () => {
  it("stores the report, hides the item in one guarded write, and notifies moderators once", async () => {
    const { deps, execute, notify, store } = fakes();

    await expect(
      reportItem(deps, {
        viewer: member(),
        itemId: 1,
        reason: "inappropriate",
        note: "  Not for here  ",
      }),
    ).resolves.toEqual({ hidden: true });

    expect(reportsOf(store)).toEqual([
      expect.objectContaining({
        item: 1,
        reporterId: "u2",
        reason: "inappropriate",
        note: "Not for here",
      }),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    const hide = rendered(execute.mock.calls[0]![0]);
    expect(hide.sql).toMatch(
      /^\s*UPDATE "gallery_items"\s+SET "hidden_at" = \$1, "updated_at" = now\(\)\s+WHERE "id" = \$2 AND "hidden_at" IS NULL\s+RETURNING "id"\s*$/,
    );
    expect(hide.params).toEqual([NOW.toISOString(), 1]);
    expect(itemRow(store)).toMatchObject({
      hiddenAt: NOW.toISOString(),
      reportCount: 1,
    });
    expect(notify.itemReported).toHaveBeenCalledExactlyOnceWith({
      communityId: "c1",
      itemId: 1,
    });
    expect(notify.uploaderThisIsMe).not.toHaveBeenCalled();
  });

  it("stores no note when the note is blank", async () => {
    const { deps, store } = fakes();
    await reportItem(deps, {
      viewer: member(),
      itemId: 1,
      reason: "spam",
      note: "   ",
    });
    expect(reportsOf(store)[0]!.note).toBeUndefined();
  });

  it("does not notify moderators again for an item already hidden, and counts only open reports", async () => {
    const { deps, notify, store } = fakes({
      items: [item(1, { hiddenAt: ago(HOUR), reportCount: 1 })],
      reports: [report(1), report(2, { dismissedAt: ago(2 * HOUR) })],
    });

    await reportItem(deps, {
      viewer: moderator(),
      itemId: 1,
      reason: "copyright",
    });

    expect(notify.itemReported).not.toHaveBeenCalled();
    expect(itemRow(store)).toMatchObject({
      hiddenAt: ago(HOUR),
      reportCount: 2,
    });
  });

  it("notifies moderators once when two first reports land together", async () => {
    const { deps, notify, store } = fakes();
    await Promise.all([
      reportItem(deps, { viewer: member("u2"), itemId: 1, reason: "spam" }),
      reportItem(deps, { viewer: member("u4"), itemId: 1, reason: "other" }),
    ]);
    expect(notify.itemReported).toHaveBeenCalledTimes(1);
    expect(reportsOf(store)).toHaveLength(2);
  });

  it("refuses a second report by the same person, even after a restore dismissed the first", async () => {
    const { deps, payload, execute } = fakes({
      reports: [report(1, { reporterId: "u2", dismissedAt: ago(HOUR) })],
    });
    await expect(
      reportItem(deps, { viewer: member("u2"), itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "ALREADY_REPORTED" });
    expect(payload.create).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("answers ALREADY_REPORTED when a concurrent report by the same person won", async () => {
    const { deps, payload, execute, store } = fakes();
    // The check finds nothing; the unique index then refuses the create.
    payload.find.mockImplementationOnce(async () => ({
      docs: [item(1)],
    }));
    payload.find.mockImplementationOnce(async () => ({ docs: [] }));
    store["gallery-reports"]!.push(report(1, { reporterId: "u2" }));

    await expect(
      reportItem(deps, { viewer: member("u2"), itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "ALREADY_REPORTED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes on any other failure to store the report", async () => {
    const { deps, payload, execute } = fakes();
    payload.create.mockRejectedValueOnce(new Error("db down"));
    await expect(
      reportItem(deps, { viewer: member(), itemId: 1, reason: "spam" }),
    ).rejects.toThrow("db down");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("reportItem — Review Focus 5: this is me", () => {
  it("refuses the uploader reporting their own item, whatever the reason", async () => {
    for (const reason of ["this_is_me", "spam"] as const) {
      const { deps, store, notify } = fakes();
      await expect(
        reportItem(deps, { viewer: member("u1"), itemId: 1, reason }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "OWN_ITEM" });
      expect(reportsOf(store)).toEqual([]);
      expect(itemRow(store)!.hiddenAt).toBeNull();
      expect(notify.uploaderThisIsMe).not.toHaveBeenCalled();
    }
  });

  it("refuses a moderator reporting their own hidden item too", async () => {
    const { deps } = fakes({
      items: [item(1, { uploaderId: "u3", hiddenAt: ago(HOUR) })],
    });
    await expect(
      reportItem(deps, { viewer: moderator("u3"), itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "OWN_ITEM" });
  });

  it("tells the uploader on every such report, not only the first", async () => {
    const { deps, notify } = fakes();
    await reportItem(deps, {
      viewer: member("u2"),
      itemId: 1,
      reason: "this_is_me",
    });
    // Hidden now: only a moderator can still read it, and report it.
    await expect(
      reportItem(deps, { viewer: member("u4"), itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await reportItem(deps, {
      viewer: moderator("u3"),
      itemId: 1,
      reason: "this_is_me",
    });
    expect(notify.uploaderThisIsMe).toHaveBeenCalledTimes(2);
    expect(notify.uploaderThisIsMe).toHaveBeenCalledWith({
      communityId: "c1",
      itemId: 1,
      uploaderId: "u1",
    });
    expect(notify.itemReported).toHaveBeenCalledTimes(1);
  });

  it("does not tell the uploader about other reasons", async () => {
    const { deps, notify } = fakes();
    await reportItem(deps, { viewer: member(), itemId: 1, reason: "spam" });
    expect(notify.uploaderThisIsMe).not.toHaveBeenCalled();
  });

  it("tells no one for an uploader who deleted their account, but still hides it and tells moderators", async () => {
    const { deps, notify, store } = fakes({
      items: [item(1, { uploaderId: DELETED_AUTHOR_ID })],
    });
    await reportItem(deps, {
      viewer: member(),
      itemId: 1,
      reason: "this_is_me",
    });
    expect(notify.uploaderThisIsMe).not.toHaveBeenCalled();
    expect(notify.itemReported).toHaveBeenCalledTimes(1);
    expect(itemRow(store)!.hiddenAt).toBe(NOW.toISOString());
  });
});

describe("reportItem — notifications never fail the report", () => {
  it("logs a failed moderator or uploader notice and still answers hidden", async () => {
    const { deps, notify, log, store } = fakes();
    notify.itemReported.mockRejectedValueOnce(new Error("inbox down"));
    notify.uploaderThisIsMe.mockRejectedValueOnce(new Error("inbox down"));

    await expect(
      reportItem(deps, {
        viewer: member(),
        itemId: 1,
        reason: "this_is_me",
      }),
    ).resolves.toEqual({ hidden: true });

    expect(itemRow(store)).toMatchObject({
      hiddenAt: NOW.toISOString(),
      reportCount: 1,
    });
    expect(log).toHaveBeenCalledWith(
      "[gallery.reportItem] moderator notification failed",
      expect.objectContaining({ itemId: 1 }),
    );
    expect(log).toHaveBeenCalledWith(
      "[gallery.reportItem] uploader notification failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });
});

describe("listItemReports", () => {
  it("refuses anyone but a moderator, the uploader included", async () => {
    for (const who of [member("u1"), member(), outsider()]) {
      const { deps, payload } = fakes({ reports: [report(1)] });
      await expect(
        listItemReports(deps, { viewer: who, itemId: 1 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "NOT_ALLOWED" });
      expect(payload.find).not.toHaveBeenCalled();
    }
  });

  it("gives moderators the open reports, newest first, with their ids but not who reported", async () => {
    const { deps } = fakes({
      items: [item(1, { hiddenAt: ago(HOUR) })],
      reports: [
        report(1, { reason: "spam", note: "Ads" }),
        report(2, { reason: "this_is_me" }),
        report(3, { dismissedAt: ago(HOUR) }),
        report(4, { item: 2 }),
      ],
    });

    await expect(
      listItemReports(deps, { viewer: moderator(), itemId: 1 }),
    ).resolves.toEqual({
      reports: [
        {
          id: 2,
          reason: "this_is_me",
          note: null,
          createdAt: ago(HOUR - 2000),
        },
        { id: 1, reason: "spam", note: "Ads", createdAt: ago(HOUR - 1000) },
      ],
    });
  });

  it("gives at most the reports one restore may name, newest first", async () => {
    const { deps } = fakes({
      items: [item(1, { hiddenAt: ago(HOUR) })],
      reports: Array.from({ length: GALLERY_REVIEW_REPORTS_MAX + 1 }, (_, n) =>
        report(n + 1),
      ),
    });
    const { reports } = await listItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
    });
    expect(reports).toHaveLength(GALLERY_REVIEW_REPORTS_MAX);
    expect(reports[0]!.id).toBe(GALLERY_REVIEW_REPORTS_MAX + 1);
  });

  it("answers NOT_FOUND for another community's item", async () => {
    const { deps } = fakes({
      items: [item(1, { communityId: "c2" })],
      reports: [report(1)],
    });
    await expect(
      listItemReports(deps, { viewer: moderator(), itemId: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reviewItemReports", () => {
  const hiddenItem = () => [item(1, { hiddenAt: ago(HOUR), reportCount: 2 })];
  /** A decision; a restore names the reports the moderator read. */
  const review = (action: "restore" | "remove", reviewedReportIds = [1]) =>
    action === "restore" ? { action, reviewedReportIds } : { action };

  it("refuses anyone but a moderator and changes nothing", async () => {
    for (const action of ["restore", "remove"] as const) {
      const { deps, store, storage } = fakes({
        items: hiddenItem(),
        reports: [report(1)],
      });
      await expect(
        reviewItemReports(deps, {
          viewer: member("u1"),
          itemId: 1,
          ...review(action),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "NOT_ALLOWED" });
      expect(itemRow(store)).toMatchObject({ hiddenAt: ago(HOUR) });
      expect(reportsOf(store)).toHaveLength(1);
      expect(storage.remove).not.toHaveBeenCalled();
    }
  });

  it("restore shows the item again and dismisses the reviewed open reports, keeping them", async () => {
    const { deps, store } = fakes({
      items: hiddenItem(),
      reports: [
        report(1),
        report(2),
        report(3, { dismissedAt: ago(3 * HOUR) }),
        report(4, { item: 2 }),
      ],
    });

    // 3 is already dismissed and 4 is another item's: both are ignored.
    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      ...review("restore", [1, 2, 3, 4]),
    });

    expect(itemRow(store)).toMatchObject({ hiddenAt: null, reportCount: 0 });
    expect(reportsOf(store).map((doc) => [doc.id, doc.dismissedAt])).toEqual([
      [1, NOW.toISOString()],
      [2, NOW.toISOString()],
      [3, ago(3 * HOUR)],
      [4, null],
    ]);
  });

  it("after a restore, a new report hides the item and notifies again; an earlier reporter can't", async () => {
    const { deps, notify } = fakes({
      items: hiddenItem(),
      reports: [report(1, { reporterId: "u2" })],
    });
    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      ...review("restore"),
    });

    await expect(
      reportItem(deps, { viewer: member("u2"), itemId: 1, reason: "spam" }),
    ).rejects.toMatchObject({ message: "ALREADY_REPORTED" });
    await reportItem(deps, {
      viewer: member("u4"),
      itemId: 1,
      reason: "spam",
    });
    expect(notify.itemReported).toHaveBeenCalledTimes(1);
  });

  it("restore keeps a report the moderator did not review open, hides the item again and notifies once", async () => {
    const { deps, notify, store, log } = fakes({
      items: hiddenItem(),
      reports: [report(1), report(2)],
    });

    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      ...review("restore", [1]),
    });

    expect(reportsOf(store).map((doc) => [doc.id, doc.dismissedAt])).toEqual([
      [1, NOW.toISOString()],
      [2, null],
    ]);
    expect(itemRow(store)).toMatchObject({
      hiddenAt: NOW.toISOString(),
      reportCount: 1,
    });
    expect(notify.itemReported).toHaveBeenCalledExactlyOnceWith({
      communityId: "c1",
      itemId: 1,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("restore does not notify when every open report was reviewed", async () => {
    const { deps, notify, execute } = fakes({
      items: hiddenItem(),
      reports: [report(1)],
    });
    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      ...review("restore"),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(notify.itemReported).not.toHaveBeenCalled();
  });

  it("a report made while a restore runs, too late to hide the item, still hides it once shown, and notifies once", async () => {
    const { deps, payload, notify, store } = fakes({
      items: hiddenItem(),
      reports: [report(1)],
    });
    // The new report lands after the restore dismissed the reviewed ones
    // and before it shows the item: its own hide finds the item hidden.
    const update = payload.update.getMockImplementation()!;
    payload.update.mockImplementation(async (args) => {
      const result = await update(args);
      if (args.collection === "gallery-reports") {
        await reportItem(deps, {
          viewer: moderator("u5"),
          itemId: 1,
          reason: "spam",
        });
        expect(notify.itemReported).not.toHaveBeenCalled();
      }
      return result;
    });

    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      ...review("restore"),
    });

    expect(itemRow(store)).toMatchObject({
      hiddenAt: NOW.toISOString(),
      reportCount: 1,
    });
    expect(
      reportsOf(store).filter((doc) => doc.dismissedAt == null),
    ).toHaveLength(1);
    expect(notify.itemReported).toHaveBeenCalledTimes(1);
  });

  it("a restore whose moderator notice fails is still a restore, and the failure is logged", async () => {
    const { deps, notify, log } = fakes({
      items: hiddenItem(),
      reports: [report(1), report(2)],
    });
    notify.itemReported.mockRejectedValueOnce(new Error("inbox down"));
    await expect(
      reviewItemReports(deps, {
        viewer: moderator(),
        itemId: 1,
        ...review("restore", [1]),
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      "[gallery.reviewItemReports] moderator notification failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("remove deletes the item and its files, and removes its batch's post once it shows nothing", async () => {
    const { deps, store, storage, execute } = fakes({
      items: hiddenItem(),
      posts: [{ id: 40, galleryBatch: 3, content: "", isDeleted: false }],
    });

    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      action: "remove",
    });

    expect(store["gallery-items"]).toEqual([]);
    expect(storage.remove).toHaveBeenCalledWith([
      "private/gallery/c1/u1.jpg",
      "private/gallery/c1/u1-thumb.jpg",
    ]);
    expect(rendered(execute.mock.calls[0]![0]).sql).toContain('"feed_posts"');
    expect(store["feed-posts"]![0]).toMatchObject({ isDeleted: true });
    expect(store["gallery-batches"]![0]).toMatchObject({ feedPostId: null });
  });

  it("remove keeps the post while the batch has another ready item", async () => {
    const { deps, store, execute } = fakes({
      items: [...hiddenItem(), item(2)],
      posts: [{ id: 40, galleryBatch: 3, content: "", isDeleted: false }],
    });
    await reviewItemReports(deps, {
      viewer: moderator(),
      itemId: 1,
      action: "remove",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(store["feed-posts"]![0]).toMatchObject({ isDeleted: false });
  });

  it("remove fails loudly and keeps the files when the row could not be deleted", async () => {
    const { deps, payload, storage, log } = fakes({ items: hiddenItem() });
    payload.delete.mockResolvedValueOnce({
      docs: [],
      errors: [{ id: 1, message: "x" }],
    });
    await expect(
      reviewItemReports(deps, {
        viewer: moderator(),
        itemId: 1,
        action: "remove",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[gallery.reviewItemReports] deleting an item failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("answers NOT_FOUND for an item that is gone, and clears reports left behind", async () => {
    for (const action of ["restore", "remove"] as const) {
      const { deps, store } = fakes({
        items: [],
        reports: [report(1), report(2, { item: 2 })],
      });
      await expect(
        reviewItemReports(deps, {
          viewer: moderator(),
          itemId: 1,
          ...review(action),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(reportsOf(store).map((doc) => doc.id)).toEqual([2]);
    }
  });

  it("answers NOT_FOUND for another community's item and leaves it and its reports alone", async () => {
    const { deps, store } = fakes({
      items: [item(1, { communityId: "c2", hiddenAt: ago(HOUR) })],
      reports: [report(1)],
    });
    await expect(
      reviewItemReports(deps, {
        viewer: moderator(),
        itemId: 1,
        action: "remove",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(store["gallery-items"]).toHaveLength(1);
    expect(reportsOf(store)).toHaveLength(1);
  });
});
