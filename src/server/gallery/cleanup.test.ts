import { beforeEach, describe, expect, it, vi } from "vitest";

const transition = vi.hoisted(() => vi.fn());
vi.mock("@/server/payload-status-transition", () => ({
  transitionStatus: transition,
}));
const deleteEmpty = vi.hoisted(() => vi.fn());
vi.mock("./empty-batches", () => ({
  deleteEmptyFinishedBatches: deleteEmpty,
}));

import { cleanupAbandonedGalleryUploads } from "./cleanup";

const NOW = new Date("2026-11-13T12:00:00.000Z");
const CUTOFF = "2026-11-12T12:00:00.000Z";

const fileKeyOf = (id: number) => `private/gallery/c1/upload-${id}.jpg`;
const thumbKeyOf = (id: number) => `private/gallery/c1/upload-${id}-thumb.jpg`;

const item = (id: number, status: "uploading" | "failed" | "ready") => ({
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
    /** Ids of the empty finished batches the delete statement removes. */
    emptyDeleted?: number[];
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
  deleteEmpty.mockReset().mockImplementation(() => {
    calls.push("deleteEmptyFinishedBatches");
    return Promise.resolve(over.emptyDeleted ?? []);
  });
  const payload = {
    // Items are filtered by the status clause of the query, so closing a
    // batch reads only its ready items, and the cleanup only the abandoned.
    find: vi
      .fn()
      .mockImplementation(
        ({ collection, where }: { collection: string; where?: Where }) => {
          if (collection === "gallery-batches") {
            return Promise.resolve({ docs: over.batches ?? [] });
          }
          if (collection !== "gallery-items") {
            return Promise.resolve({ docs: [] });
          }
          const wanted = statusesOf(where);
          return Promise.resolve({
            docs: ((over.items ?? []) as { status: string }[]).filter(
              (row) => wanted === null || wanted.includes(row.status),
            ),
          });
        },
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
  const log = vi.fn();
  return {
    calls,
    payload,
    storage,
    getStorage,
    warn,
    log,
    deps: {
      payload: payload as never,
      storage: getStorage as never,
      now: () => NOW,
      warn,
      log,
    },
  };
}

type Where = {
  and?: { status?: { in?: string[]; equals?: string } }[];
};

/** The statuses a query asks for, or null when it does not filter on status. */
function statusesOf(where: Where | undefined): string[] | null {
  const clause = where?.and?.find((c) => c.status)?.status;
  if (!clause) return null;
  return clause.in ?? (clause.equals ? [clause.equals] : null);
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

const NOTHING = {
  removed: 0,
  failed: 0,
  batchesClosed: 0,
  batchesDeleted: 0,
};

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
      ...NOTHING,
      removed: 1,
    });
    // Files first: if the row went first, a failed removal would leave
    // objects no row points at until the production-only sweep.
    expect(calls.slice(0, 2)).toEqual([
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

  it("never removes a key outside the gallery folders, and says so", async () => {
    const odd = { ...item(5, "failed"), fileKey: "private/videos/c1/x.mp4" };
    const { deps, storage, payload, log } = fakes({ items: [odd] });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toMatchObject({
      removed: 1,
      failed: 0,
    });
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith([thumbKeyOf(5)]);
    expect(log).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] left a key outside the gallery folders",
      { itemId: 5, keys: ["private/videos/c1/x.mp4"] },
    );
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "gallery-items",
      id: 5,
    });
  });

  it("keeps going when storage fails for one item, and keeps that row for tomorrow", async () => {
    const { deps, payload, log } = fakes({
      items: [item(1, "uploading"), item(2, "failed"), item(3, "uploading")],
      removeImpl: (keys) =>
        keys[0] === fileKeyOf(1)
          ? Promise.reject(new Error("s3 down"))
          : Promise.resolve(),
    });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      ...NOTHING,
      removed: 2,
      failed: 1,
    });
    expect(payload.delete).toHaveBeenCalledTimes(2);
    expect(payload.delete).not.toHaveBeenCalledWith({
      collection: "gallery-items",
      id: 1,
    });
    expect(log).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] removing an abandoned item failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("keeps going when a row cannot be deleted", async () => {
    const { deps, payload } = fakes({
      items: [item(1, "uploading"), item(2, "uploading")],
    });
    payload.delete.mockRejectedValueOnce(new Error("db down"));
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

describe("cleanupAbandonedGalleryUploads: open batches", () => {
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
    const { deps, payload } = fakes({ batches: [openBatch(3)] });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      ...NOTHING,
      batchesClosed: 1,
    });
    expect(transition).toHaveBeenCalledWith(payload, {
      collection: "gallery-batches",
      id: 3,
      from: "open",
      to: "finished",
    });
    // Closing never deletes: that is the empty-batch pass's job alone.
    expect(payload.delete).not.toHaveBeenCalled();
  });

  it("reads only the batch's ready items when closing it", async () => {
    const { deps, payload } = fakes({
      items: [item(1, "uploading"), item(2, "ready")],
      batches: [openBatch(3)],
    });
    await cleanupAbandonedGalleryUploads(deps);
    const at = (payload.find.mock.calls as [{ where?: unknown }][]).findIndex(
      ([args]) => JSON.stringify(args.where).includes('"equals":"ready"'),
    );
    expect(at).toBeGreaterThanOrEqual(0);
    const { docs } = (await payload.find.mock.results[at]!.value) as {
      docs: unknown[];
    };
    expect(docs).toEqual([item(2, "ready")]);
  });

  it("leaves a batch a late finishBatch moved first to that finish", async () => {
    const { deps } = fakes({ batches: [openBatch(3)], lostRace: [3] });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual(
      NOTHING,
    );
  });

  it("keeps going when one batch cannot be closed", async () => {
    const { deps, log } = fakes({ batches: [openBatch(3), openBatch(4)] });
    transition.mockRejectedValueOnce(new Error("db down"));
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      ...NOTHING,
      failed: 1,
      batchesClosed: 1,
    });
    expect(log).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] closing an abandoned batch failed",
      expect.objectContaining({ batchId: 3 }),
    );
  });
});

describe("cleanupAbandonedGalleryUploads: empty finished batches", () => {
  it("deletes empty finished batches older than 24 hours, 200 at most", async () => {
    const { deps, payload } = fakes({ emptyDeleted: [3, 9] });
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      ...NOTHING,
      batchesDeleted: 2,
    });
    expect(deleteEmpty).toHaveBeenCalledWith(payload, {
      createdBefore: CUTOFF,
      limit: 200,
    });
  });

  it("runs after the items are removed and the open batches closed, so they go the same day", async () => {
    const { deps, calls } = fakes({
      items: [item(1, "uploading")],
      batches: [openBatch(3)],
    });
    await cleanupAbandonedGalleryUploads(deps);
    expect(calls).toEqual([
      `remove:${fileKeyOf(1)},${thumbKeyOf(1)}`,
      "delete:gallery-items:1",
      "transition:gallery-batches:3",
      "deleteEmptyFinishedBatches",
    ]);
  });

  it("warns when the page is full", async () => {
    const full = Array.from({ length: 200 }, (_, i) => i + 1);
    const { deps, warn } = fakes({ emptyDeleted: full });
    await cleanupAbandonedGalleryUploads(deps);
    expect(warn).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] page full; more abandoned empty batches may remain",
      { pageSize: 200 },
    );
  });

  it("counts and logs a failed delete, keeping the other results", async () => {
    const { deps, log } = fakes({ items: [item(1, "uploading")] });
    deleteEmpty.mockRejectedValueOnce(new Error("db down"));
    await expect(cleanupAbandonedGalleryUploads(deps)).resolves.toEqual({
      ...NOTHING,
      removed: 1,
      failed: 1,
    });
    expect(log).toHaveBeenCalledWith(
      "[gallery-uploads-cleanup] deleting empty batches failed",
      { error: expect.any(Error) },
    );
  });
});
