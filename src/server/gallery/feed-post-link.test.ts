import { describe, expect, it, vi } from "vitest";

import {
  galleryBatchIdOf,
  releaseBatchLink,
  releaseEmptyGalleryPost,
  removeBatchItems,
} from "./feed-post-link";

type Doc = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Just enough of Payload's `where` (`and`, `equals`) to run these queries in memory. */
function matches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "and") {
      return (condition as Where[]).every((w) => matches(doc, w));
    }
    return Object.entries(condition as Record<string, unknown>).every(
      ([op, operand]) => {
        if (op !== "equals") throw new Error(`fake payload: unsupported ${op}`);
        return doc[key] === operand;
      },
    );
  });
}

function item(id: number, over: Doc = {}): Doc {
  return {
    id,
    batch: 3,
    status: "ready",
    fileKey: `private/gallery/c1/u${id}.jpg`,
    thumbnailKey: `private/gallery/c1/u${id}-thumb.jpg`,
    ...over,
  };
}

function post(over: Doc = {}): Doc {
  return {
    id: 40,
    content: "",
    authorName: "Dana",
    communityId: "c1",
    isDeleted: false,
    galleryBatch: 3,
    updatedAt: "2026-11-13T10:00:00.000Z",
    ...over,
  };
}

function batch(over: Doc = {}): Doc {
  return { id: 3, status: "finished", feedPostId: 40, ...over };
}

function fakes(seed: { items?: Doc[]; posts?: Doc[]; batches?: Doc[] } = {}) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [],
    "feed-posts": seed.posts ?? [],
    "gallery-batches": seed.batches ?? [batch()],
  };
  const rows = (collection: string) => store[collection] ?? [];
  const payload = {
    find: vi.fn(
      async (args: { collection: string; where?: Where; limit?: number }) => {
        const found = rows(args.collection).filter((doc) =>
          matches(doc, args.where),
        );
        return { docs: args.limit ? found.slice(0, args.limit) : found };
      },
    ),
    update: vi.fn(
      async (args: { collection: string; where: Where; data: Doc }) => {
        const list = rows(args.collection);
        const docs: Doc[] = [];
        list.forEach((doc, index) => {
          if (!matches(doc, args.where)) return;
          list[index] = { ...doc, ...args.data };
          docs.push(list[index]);
        });
        return { docs, errors: [] as unknown[] };
      },
    ),
    delete: vi.fn(async (args: { collection: string; where: Where }) => {
      const gone = rows(args.collection).filter((doc) =>
        matches(doc, args.where),
      );
      store[args.collection] = rows(args.collection).filter(
        (doc) => !gone.includes(doc),
      );
      return { docs: gone, errors: [] as unknown[] };
    }),
  };
  const storage = { remove: vi.fn(async () => undefined) };
  const storageSource = vi.fn(() => storage);
  const log = vi.fn();
  const deps = {
    payload: payload as never,
    storage: storageSource as never,
    log,
  };
  return { deps, payload, storage, storageSource, log, store };
}

const REMOVED = {
  isDeleted: true,
  content: "",
  authorName: "",
  images: [],
  image: null,
  imageUrl: null,
  galleryBatch: null,
};

describe("removeBatchItems", () => {
  it("deletes every item of the batch, whatever its state, and their files", async () => {
    const { deps, storage, store } = fakes({
      items: [
        item(1),
        item(2, { status: "uploading" }),
        item(3, { status: "failed" }),
        item(4, { batch: 8 }),
      ],
    });

    await removeBatchItems(deps, 3);

    expect(store["gallery-items"]!.map((doc) => doc.id)).toEqual([4]);
    expect(storage.remove).toHaveBeenCalledTimes(3);
    expect(storage.remove).toHaveBeenCalledWith([
      "private/gallery/c1/u1.jpg",
      "private/gallery/c1/u1-thumb.jpg",
    ]);
  });

  it("never reaches storage for a batch with no items left", async () => {
    const { deps, storageSource } = fakes({ items: [item(4, { batch: 8 })] });
    await removeBatchItems(deps, 3);
    expect(storageSource).not.toHaveBeenCalled();
  });

  it("keeps going when a file cannot be removed: the unused-files sweep is the net", async () => {
    const { deps, storage, store, log } = fakes({
      items: [item(1), item(2)],
    });
    storage.remove.mockRejectedValueOnce(new Error("S3 down"));

    await expect(removeBatchItems(deps, 3)).resolves.toBeUndefined();

    expect(store["gallery-items"]).toEqual([]);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "[gallery.removeBatchItems] removing an item's objects failed",
      expect.objectContaining({ itemId: 1 }),
    );
  });

  it("fails loudly when rows could not be deleted, removing only the deleted rows' files", async () => {
    const { deps, payload, storage, log } = fakes({
      items: [item(1), item(2)],
    });
    payload.delete.mockResolvedValueOnce({
      docs: [item(1)],
      errors: [{ id: 2, message: "x" }],
    });

    await expect(removeBatchItems(deps, 3)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith([
      "private/gallery/c1/u1.jpg",
      "private/gallery/c1/u1-thumb.jpg",
    ]);
    expect(log).toHaveBeenCalledWith(
      "[gallery.removeBatchItems] deleting a batch's items failed",
      expect.objectContaining({ batchId: 3 }),
    );
  });
});

describe("releaseEmptyGalleryPost", () => {
  it("removes a post with no words once its batch has no ready item left", async () => {
    const { deps, store } = fakes({
      items: [item(2, { status: "failed" }), item(5, { batch: 8 })],
      posts: [post()],
    });

    await releaseEmptyGalleryPost(deps, 3);

    expect(store["feed-posts"]![0]).toMatchObject(REMOVED);
  });

  it("removes a post whose words are only blanks", async () => {
    const { deps, store } = fakes({ posts: [post({ content: "  \n " })] });
    await releaseEmptyGalleryPost(deps, 3);
    expect(store["feed-posts"]![0]).toMatchObject(REMOVED);
  });

  it("keeps a post that still has words: the card shows its text", async () => {
    const { deps, payload, store } = fakes({
      posts: [post({ content: "Our summer picnic" })],
    });
    await releaseEmptyGalleryPost(deps, 3);
    expect(store["feed-posts"]![0]).toMatchObject({
      isDeleted: false,
      galleryBatch: 3,
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("keeps a post while a ready item is left, even a hidden one a moderator may restore", async () => {
    const { deps, payload } = fakes({
      items: [item(1, { hiddenAt: "2026-11-13T10:00:00.000Z" })],
      posts: [post()],
    });
    await releaseEmptyGalleryPost(deps, 3);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("does nothing for a batch no live post announces", async () => {
    const { deps, payload } = fakes({
      posts: [post({ galleryBatch: 8 }), post({ id: 41, isDeleted: true })],
    });
    await releaseEmptyGalleryPost(deps, 3);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("clears the batch's link to the removed post, so the cleanup can take the batch", async () => {
    const { deps, store } = fakes({ posts: [post()] });
    await releaseEmptyGalleryPost(deps, 3);
    expect(store["gallery-batches"]![0]).toMatchObject({ feedPostId: null });
  });

  it("leaves a post that gained words between the read and the write, and its batch link", async () => {
    const { deps, payload, store } = fakes({ posts: [post()] });
    const read = payload.find.getMockImplementation()!;
    payload.find.mockImplementation(async (args) => {
      const result = await read(args);
      // The author saves words while the last item is being deleted.
      if (args.collection === "gallery-items") {
        store["feed-posts"]![0] = post({
          content: "Our picnic",
          updatedAt: "2026-11-13T10:00:05.000Z",
        });
      }
      return result;
    });

    await releaseEmptyGalleryPost(deps, 3);

    expect(store["feed-posts"]![0]).toMatchObject({
      isDeleted: false,
      content: "Our picnic",
      galleryBatch: 3,
    });
    expect(store["gallery-batches"]![0]).toMatchObject({ feedPostId: 40 });
  });

  it("fails loudly when the post could not be saved", async () => {
    const { deps, payload, log } = fakes({ posts: [post()] });
    payload.update.mockResolvedValueOnce({
      docs: [],
      errors: [{ id: 40, message: "x" }],
    });
    await expect(releaseEmptyGalleryPost(deps, 3)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(payload.update).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[gallery.releaseEmptyGalleryPost] removing an empty gallery post failed",
      expect.objectContaining({ batchId: 3, postId: 40 }),
    );
  });
});

describe("releaseBatchLink", () => {
  it("clears the batch's feed post while it names the removed post", async () => {
    const { deps, store } = fakes();
    await releaseBatchLink(deps, { batchId: 3, postId: 40 });
    expect(store["gallery-batches"]![0]).toMatchObject({ feedPostId: null });
  });

  it("never clears a link to another post", async () => {
    const { deps, store } = fakes({ batches: [batch({ feedPostId: 41 })] });
    await releaseBatchLink(deps, { batchId: 3, postId: 40 });
    expect(store["gallery-batches"]![0]).toMatchObject({ feedPostId: 41 });
  });

  it("logs a failed write without throwing: the post is already removed", async () => {
    const { deps, payload, log } = fakes();
    payload.update.mockResolvedValueOnce({
      docs: [],
      errors: [{ id: 3, message: "x" }],
    });
    await expect(
      releaseBatchLink(deps, { batchId: 3, postId: 40 }),
    ).resolves.toBeUndefined();
    payload.update.mockRejectedValueOnce(new Error("db down"));
    await expect(
      releaseBatchLink(deps, { batchId: 3, postId: 40 }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "[gallery.releaseBatchLink] clearing a batch's feed post failed",
      expect.objectContaining({ batchId: 3, postId: 40 }),
    );
  });
});

describe("galleryBatchIdOf", () => {
  it("reads the batch id, stored or populated, and null for other posts", () => {
    expect(galleryBatchIdOf({ galleryBatch: 3 })).toBe(3);
    expect(galleryBatchIdOf({ galleryBatch: { id: 3 } as never })).toBe(3);
    expect(galleryBatchIdOf({ galleryBatch: null })).toBeNull();
    expect(galleryBatchIdOf({})).toBeNull();
  });
});
