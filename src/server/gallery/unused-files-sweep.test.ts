import { describe, expect, it, vi } from "vitest";

import { RemoveObjectsError } from "@/server/media/object-storage";

import {
  sweepUnusedGalleryFiles,
  UNUSED_GALLERY_MIN_AGE_HOURS,
} from "./unused-files-sweep";

const NOW = new Date("2026-11-13T03:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const OLD = new Date(NOW.getTime() - (UNUSED_GALLERY_MIN_AGE_HOURS + 1) * HOUR);
/** Just inside the seven days: still too young to sweep. */
const YOUNG = new Date(
  NOW.getTime() - (UNUSED_GALLERY_MIN_AGE_HOURS - 1) * HOUR,
);

const PUBLIC = "media/gallery/public/";
const PRIVATE = "private/gallery/";

type Row = { id: number; fileKey: string; thumbnailKey: string };

const row = (id: number, folder: string, community = "c1"): Row => ({
  id,
  fileKey: `${folder}${community}/u${id}.jpg`,
  thumbnailKey: `${folder}${community}/u${id}-thumb.jpg`,
});

const listed = (key: string, lastModified = OLD) => ({ key, lastModified });

function fakes(over: {
  rows?: Row[];
  objects?: Record<string, { key: string; lastModified: Date }[]>;
  findError?: Error;
}) {
  const rows = [...(over.rows ?? [])].sort((a, b) => a.id - b.id);
  const payload = {
    // Keyset pages: rows after `id > n`, in id order, at most `limit`.
    find: vi
      .fn()
      .mockImplementation(
        ({
          where,
          limit,
        }: {
          where?: { id?: { greater_than?: number } };
          limit: number;
        }) => {
          if (over.findError) return Promise.reject(over.findError);
          const after = where?.id?.greater_than ?? 0;
          return Promise.resolve({
            docs: rows.filter((r) => r.id > after).slice(0, limit),
          });
        },
      ),
  };
  const storage = {
    list: vi.fn(async function* (prefix: string) {
      for (const object of over.objects?.[prefix] ?? []) yield object;
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const log = vi.fn();
  return {
    payload,
    storage,
    log,
    deps: {
      payload: payload as never,
      storage: () => storage,
      now: () => NOW,
      log,
    },
  };
}

const removedKeys = (storage: ReturnType<typeof fakes>["storage"]) =>
  (storage.remove.mock.calls as [string[]][]).flatMap(([keys]) => keys);

describe("sweepUnusedGalleryFiles", () => {
  it("keeps every file a gallery item points at, whatever its status, and removes the rest", async () => {
    // Statuses are not part of the query: every row's keys are in use.
    const uploading = row(1, PRIVATE);
    const ready = row(2, PUBLIC);
    const { deps, storage } = fakes({
      rows: [uploading, ready],
      objects: {
        [PUBLIC]: [
          listed(ready.fileKey),
          listed(ready.thumbnailKey),
          listed(`${PUBLIC}c1/lost.jpg`),
        ],
        [PRIVATE]: [
          listed(uploading.fileKey),
          listed(uploading.thumbnailKey),
          listed(`${PRIVATE}c1/lost-thumb.jpg`),
        ],
      },
    });
    await expect(sweepUnusedGalleryFiles(deps)).resolves.toEqual({
      scanned: 6,
      removed: 2,
      failed: 0,
    });
    expect(removedKeys(storage)).toEqual([
      `${PUBLIC}c1/lost.jpg`,
      `${PRIVATE}c1/lost-thumb.jpg`,
    ]);
  });

  it("reads which files are in use from every gallery item, two fields at a time, page by page", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1, PRIVATE));
    const { deps, payload, storage } = fakes({
      rows,
      objects: {
        [PRIVATE]: [
          listed(rows[0]!.fileKey),
          listed(rows[1499]!.thumbnailKey),
          listed(rows[2499]!.fileKey),
          listed(`${PRIVATE}c1/lost.jpg`),
        ],
      },
    });
    await expect(sweepUnusedGalleryFiles(deps)).resolves.toMatchObject({
      removed: 1,
    });
    expect(removedKeys(storage)).toEqual([`${PRIVATE}c1/lost.jpg`]);
    expect(payload.find).toHaveBeenCalledTimes(3);
    for (const [args] of payload.find.mock.calls as [
      Record<string, unknown>,
    ][]) {
      expect(args).toMatchObject({
        collection: "gallery-items",
        select: { fileKey: true, thumbnailKey: true },
        sort: "id",
        limit: 1000,
        pagination: false,
        depth: 0,
      });
      // No status filter: an uploading or failed row protects its files too.
      expect(JSON.stringify(args.where)).not.toContain("status");
    }
    expect(
      (payload.find.mock.calls as [{ where?: unknown }][]).map(
        ([args]) => args.where,
      ),
    ).toEqual([
      { id: { greater_than: 0 } },
      { id: { greater_than: 1000 } },
      { id: { greater_than: 2000 } },
    ]);
  });

  it("never removes a file younger than seven days", async () => {
    const { deps, storage } = fakes({
      objects: {
        [PUBLIC]: [listed(`${PUBLIC}c1/new.jpg`, YOUNG)],
        [PRIVATE]: [listed(`${PRIVATE}c1/new.mp4`, YOUNG)],
      },
    });
    await expect(sweepUnusedGalleryFiles(deps)).resolves.toEqual({
      scanned: 2,
      removed: 0,
      failed: 0,
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("never removes a key outside the gallery folders, even when the listing returns one", async () => {
    // A misbehaving list ignores its prefix.
    const { deps, storage } = fakes({
      objects: {
        [PRIVATE]: [
          listed("private/videos/x.mp4"),
          listed("media/videos/public/c1/x.mp4"),
          listed("private/gallery/c1/../../videos/x.mp4"),
          listed("private/gallery/c1/nested/x.jpg"),
          listed("private/gallery/c1/x.png"),
          listed(`${PRIVATE}c1/lost.mp4`),
        ],
      },
    });
    await expect(sweepUnusedGalleryFiles(deps)).resolves.toMatchObject({
      scanned: 6,
      removed: 1,
    });
    expect(removedKeys(storage)).toEqual([`${PRIVATE}c1/lost.mp4`]);
  });

  it("removes in batches S3 accepts", async () => {
    const lost = Array.from({ length: 1001 }, (_, i) =>
      listed(`${PRIVATE}c1/lost-${i}.jpg`),
    );
    const { deps, storage } = fakes({ objects: { [PRIVATE]: lost } });
    await expect(sweepUnusedGalleryFiles(deps)).resolves.toMatchObject({
      removed: 1001,
    });
    expect(
      (storage.remove.mock.calls as [string[]][]).map(([keys]) => keys.length),
    ).toEqual([1000, 1]);
  });

  it("counts only the keys S3 refused when a batch partly fails, and logs them", async () => {
    const lost = ["a", "b", "c"].map((name) =>
      listed(`${PRIVATE}c1/${name}.jpg`),
    );
    const { deps, storage, log } = fakes({ objects: { [PRIVATE]: lost } });
    storage.remove.mockRejectedValueOnce(
      new RemoveObjectsError([`${PRIVATE}c1/b.jpg`], "b (AccessDenied)"),
    );
    await expect(sweepUnusedGalleryFiles(deps)).resolves.toEqual({
      scanned: 3,
      removed: 2,
      failed: 1,
    });
    expect(log).toHaveBeenCalledWith("[unused-gallery-files] removal failed", {
      keys: [`${PRIVATE}c1/b.jpg`],
      error: expect.any(RemoveObjectsError),
    });
  });

  it("deletes nothing when it cannot read which files are in use", async () => {
    const { deps, storage } = fakes({ findError: new Error("db down") });
    await expect(sweepUnusedGalleryFiles(deps)).rejects.toThrow("db down");
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
