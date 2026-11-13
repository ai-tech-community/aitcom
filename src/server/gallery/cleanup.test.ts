import { beforeEach, describe, expect, it, vi } from "vitest";

const transition = vi.hoisted(() => vi.fn());
vi.mock("@/server/payload-status-transition", () => ({
  transitionStatus: transition,
}));

import { cleanupAbandonedGalleryUploads } from "./cleanup";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const CUTOFF = "2026-11-12T12:00:00.000Z";

const fileKeyOf = (id: number) => `private/gallery/c1/upload-${id}.jpg`;
const thumbKeyOf = (id: number) => `private/gallery/c1/upload-${id}-thumb.jpg`;

const item = (id: number, status: "uploading" | "failed") => ({
  id,
  status,
  storage: "private",
  fileKey: fileKeyOf(id),
  thumbnailKey: thumbKeyOf(id),
  batch: 3,
});

const openBatch = (id: number) => ({ id, status: "open", feedPostId: null });

function fakes(
  over: {
    items?: unknown[];
    batches?: unknown[];
    /** Items left in each batch once the abandoned ones are gone. */
    itemsLeft?: Record<number, number>;
    /** Batches a concurrent finishBatch moved first. */
    lostRace?: number[];
    removeImpl?: (keys: string[]) => Promise<void>;
  } = {},
) {
  const calls: string[] = [];
  transition
    .mockReset()
    .mockImplementation(
      (_payload: unknown, t: { collection: string; id: number }) => {
        calls.push(`transition:${t.collection}:${t.id}`);
        return Promise.resolve(!over.lostRace?.includes(t.id));
      },
    );
  const payload = {
    find: vi.fn().mockImplementation(({ collection }: { collection: string }) =>
      Promise.resolve({
        docs:
          collection === "gallery-batches"
            ? (over.batches ?? [])
            : collection === "gallery-items"
              ? (over.items ?? [])
              : [],
      }),
    ),
    count: vi
      .fn()
      .mockImplementation(
        ({ where }: { where: { batch: { equals: number } } }) =>
          Promise.resolve({
            totalDocs: over.itemsLeft?.[where.batch.equals] ?? 0,
          }),
      ),
    delete: vi
      .fn()
      .mockImplementation(
        ({ collection, id }: { collection: string; id: number }) => {
          calls.push(`delete:${collection}:${id}`);
          return Promise.resolve({});
        },
      ),
    update: vi.fn(),
  };
  const storage = {
    remove: vi.fn().mockImplementation((keys: string[]) => {
      calls.push(`remove:${keys.join(",")}`);
      return (over.removeImpl ?? (() => Promise.resolve()))(keys);
    }),
  };
  const getStorage = vi.fn(() => storage);
  const warn = vi.fn();
  return {
    calls,
    payload,
    storage,
    getStorage,
    warn,
    deps: {
      payload: payload as never,
      storage: getStorage as never,
      now: () => NOW,
      warn,
    },
  };
}

/** The find for abandoned items (not the ready-items read of closing a batch). */
function abandonedItemsQuery(payload: ReturnType<typeof fakes>["payload"]) {
  return payload.find.mock.calls
    .map(([args]) => args as { collection: string; where: unknown })
    .find(
      (args) =>
        args.collection === "gallery-items" &&
        JSON.stringify(args.where).includes("uploading"),
    );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("cleanupAbandonedGalleryUploads: items", () => {
  it("looks only at uploading or failed items older than 24 hours, oldest first", async () => {
    const { deps, payload } = fakes();
    await cleanupAbandonedGalleryUploads(deps);
    expect(abandonedItemsQuery(payload)).toEqual({
      collection: "gallery-items",
      where: {
        and: [
          { status: { in: ["uploading", "failed"] } },
          { createdAt: { less_than: CUTOFF } },
        ],
      },
      sort: "createdAt",
      limit: 200,
      depth: 0,
    });
  });

  it("removes an abandoned item's file and thumbnail, then its row", async () => {
    const { deps, calls } = fakes({ items: [item(1, "uploading")] });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 0,
      batchesClosed: 0,
    });
    // Files first: if the row went first, a failed removal would leave
    // objects no row points at until the production-only sweep.
    expect(calls).toEqual([
      `remove:${fileKeyOf(1)},${thumbKeyOf(1)}`,
      "delete:gallery-items:1",
    ]);
  });

  it("removes a failed item's files again, in case a live grant stored them late", async () => {
    const { deps, storage, payload } = fakes({ items: [item(4, "failed")] });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toMatchObject({
      removed: 1,
      failed: 0,
    });
    expect(storage.remove).toHaveBeenCalledWith([fileKeyOf(4), thumbKeyOf(4)]);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "gallery-items",
      id: 4,
    });
  });

  it("keeps going when storage fails for one item, and keeps that row for tomorrow", async () => {
    const { deps, payload } = fakes({
      items: [item(1, "uploading"), item(2, "failed"), item(3, "uploading")],
      removeImpl: (keys) =>
        keys[0] === fileKeyOf(1)
          ? Promise.reject(new Error("s3 down"))
          : Promise.resolve(),
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      removed: 2,
      failed: 1,
      batchesClosed: 0,
    });
    expect(payload.delete).toHaveBeenCalledTimes(2);
    expect(payload.delete).not.toHaveBeenCalledWith({
      collection: "gallery-items",
      id: 1,
    });
    expect(error).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] removing an abandoned item failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("keeps going when a row cannot be deleted", async () => {
    const { deps, payload } = fakes({
      items: [item(1, "uploading"), item(2, "uploading")],
    });
    payload.delete.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toMatchObject({
      removed: 1,
      failed: 1,
    });
  });

  it("reaches storage only when there is something to remove", async () => {
    const { deps, getStorage } = fakes({ batches: [openBatch(3)] });
    await cleanupAbandonedGalleryUploads(deps);
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("warns when the page is full, so a backlog is noticed", async () => {
    const items = Array.from({ length: 200 }, (_, i) =>
      item(i + 1, "uploading"),
    );
    const { deps, warn } = fakes({ items });
    await cleanupAbandonedGalleryUploads(deps);
    expect(warn).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] page full; more abandoned items may remain",
      { pageSize: 200 },
    );
  });
});

describe("cleanupAbandonedGalleryUploads: batches", () => {
  it("looks only at open batches older than 24 hours, oldest first", async () => {
    const { deps, payload } = fakes();
    await cleanupAbandonedGalleryUploads(deps);
    expect(payload.find).toHaveBeenCalledWith({
      collection: "gallery-batches",
      where: {
        and: [
          { status: { equals: "open" } },
          { createdAt: { less_than: CUTOFF } },
        ],
      },
      sort: "createdAt",
      limit: 200,
      depth: 0,
    });
  });

  it("closes an abandoned open batch with the same open-to-finished move finishBatch makes", async () => {
    const { deps, payload } = fakes({
      batches: [openBatch(3)],
      itemsLeft: { 3: 2 },
    });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      removed: 0,
      failed: 0,
      batchesClosed: 1,
    });
    expect(transition).toHaveBeenCalledWith(payload, {
      collection: "gallery-batches",
      id: 3,
      from: "open",
      to: "finished",
    });
    // It still has items: kept.
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("deletes a closed batch that has no items left", async () => {
    const { deps, payload, calls } = fakes({
      items: [item(1, "uploading")],
      batches: [openBatch(3)],
      itemsLeft: { 3: 0 },
    });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 0,
      batchesClosed: 1,
    });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "gallery-items",
      where: { batch: { equals: 3 } },
    });
    // Its abandoned items go first, so the batch can be empty.
    expect(calls).toEqual([
      `remove:${fileKeyOf(1)},${thumbKeyOf(1)}`,
      "delete:gallery-items:1",
      "transition:gallery-batches:3",
      "delete:gallery-batches:3",
    ]);
  });

  it("leaves a batch a late finishBatch moved first to that finish", async () => {
    const { deps, payload } = fakes({
      batches: [openBatch(3)],
      lostRace: [3],
    });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      removed: 0,
      failed: 0,
      batchesClosed: 0,
    });
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("keeps going when one batch cannot be closed", async () => {
    const { deps } = fakes({
      batches: [openBatch(3), openBatch(4)],
      itemsLeft: { 3: 1, 4: 1 },
    });
    transition.mockRejectedValueOnce(new Error("db down"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      removed: 0,
      failed: 1,
      batchesClosed: 1,
    });
    expect(error).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] closing an abandoned batch failed",
      expect.objectContaining({ batchId: 3 }),
    );
  });
});
