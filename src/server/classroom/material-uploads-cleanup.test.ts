import { describe, expect, it, vi } from "vitest";

import { cleanupAbandonedMaterialUploads } from "./material-uploads-cleanup";

const NOW = new Date("2026-09-28T12:00:00.000Z");

function fakes(
  over: {
    materials?: unknown[];
    removeImpl?: (keys: string[]) => Promise<void>;
  } = {},
) {
  const calls: string[] = [];
  const payload = {
    find: vi.fn().mockResolvedValue({ docs: over.materials ?? [] }),
    delete: vi.fn().mockImplementation(({ id }: { id: number }) => {
      calls.push(`delete:${id}`);
      return Promise.resolve({});
    }),
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

const keyOf = (id: number) => `private/classroom/c1/12/${id}.pdf`;

const uploading = (id: number) => ({
  id,
  status: "uploading",
  failureReason: null,
  storageKey: keyOf(id),
});

const failed = (id: number, failureReason: string) => ({
  id,
  status: "failed",
  failureReason,
  storageKey: keyOf(id),
});

describe("cleanupAbandonedMaterialUploads", () => {
  it("looks only at unfinished or failed uploads older than 24 hours, oldest first", async () => {
    const { deps, payload } = fakes();
    await cleanupAbandonedMaterialUploads(deps);
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { status: { in: ["uploading", "failed"] } },
          { createdAt: { less_than: "2026-09-27T12:00:00.000Z" } },
        ],
      },
      sort: "createdAt",
      limit: 200,
      depth: 0,
    });
  });

  it("deletes the file and then the record of an upload nobody finished", async () => {
    const { deps, calls } = fakes({ materials: [uploading(1)] });
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 0,
    });
    // File first: if the record went first, a failed file removal would
    // leave an object no record points at, and nothing would retry it.
    expect(calls).toEqual([`remove:${keyOf(1)}`, "delete:1"]);
  });

  it.each(["cancelled", "deleted", "UPLOAD_MISMATCH", "anything else"])(
    "sweeps a failed upload whatever the reason (%s)",
    async (reason) => {
      const { deps, storage, payload } = fakes({
        materials: [failed(7, reason)],
      });
      await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
        removed: 1,
        failed: 0,
      });
      expect(storage.remove).toHaveBeenCalledWith([keyOf(7)]);
      expect(payload.delete).toHaveBeenCalledWith({
        collection: "hosted-materials",
        id: 7,
      });
    },
  );

  it("removes an object stored late through a still-live grant after the record failed", async () => {
    const stored = new Set([keyOf(3)]);
    const { deps, payload } = fakes({
      materials: [failed(3, "cancelled")],
      removeImpl: (keys) => {
        for (const key of keys) stored.delete(key);
        return Promise.resolve();
      },
    });
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 0,
    });
    expect(stored.has(keyOf(3))).toBe(false);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 3,
    });
  });

  it("counts a record whose object was never stored as removed, not failed", async () => {
    // S3 DeleteObjects reports success for a key that does not exist, so the
    // storage adapter resolves; the sweep must not treat that as a failure.
    const { deps, payload } = fakes({
      materials: [failed(4, "deleted"), uploading(5)],
    });
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 2,
      failed: 0,
    });
    expect(payload.delete).toHaveBeenCalledTimes(2);
  });

  it("reaches storage only when there is something to remove", async () => {
    const { deps, getStorage } = fakes();
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 0,
      failed: 0,
    });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("keeps going when storage fails for one upload, and keeps that record for tomorrow", async () => {
    const { deps, payload } = fakes({
      materials: [uploading(1), failed(2, "cancelled"), uploading(3)],
      removeImpl: (keys) =>
        keys[0] === keyOf(1)
          ? Promise.reject(new Error("s3 down"))
          : Promise.resolve(),
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 2,
      failed: 1,
    });
    expect(payload.delete).toHaveBeenCalledTimes(2);
    expect(payload.delete).toHaveBeenNthCalledWith(1, {
      collection: "hosted-materials",
      id: 2,
    });
    expect(payload.delete).toHaveBeenNthCalledWith(2, {
      collection: "hosted-materials",
      id: 3,
    });
    expect(error).toHaveBeenCalledWith(
      "[material-uploads-cleanup] failed",
      expect.objectContaining({ materialId: 1 }),
    );
    error.mockRestore();
  });

  it("keeps going when a record cannot be deleted", async () => {
    const { deps, payload } = fakes({
      materials: [uploading(1), uploading(2)],
    });
    payload.delete.mockRejectedValueOnce(new Error("db down"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 1,
      failed: 1,
    });
    error.mockRestore();
  });

  it("counts every upload as failed when storage is not configured", async () => {
    const { deps, getStorage, payload } = fakes({
      materials: [uploading(1), uploading(2)],
    });
    getStorage.mockImplementation(() => {
      throw new Error("S3 is not configured for object storage");
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(cleanupAbandonedMaterialUploads(deps)).resolves.toEqual({
      removed: 0,
      failed: 2,
    });
    expect(payload.delete).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("warns when a full page means more may remain", async () => {
    const { deps, warn } = fakes({
      materials: Array.from({ length: 200 }, (_, i) => uploading(i + 1)),
    });
    await cleanupAbandonedMaterialUploads(deps);
    expect(warn).toHaveBeenCalledWith(
      "[material-uploads-cleanup] page full; more abandoned uploads may remain",
      { pageSize: 200 },
    );
  });
});
