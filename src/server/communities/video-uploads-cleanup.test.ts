// src/server/communities/video-uploads-cleanup.test.ts
import { describe, expect, it, vi } from "vitest";

import { cleanupAbandonedUploads } from "./video-uploads-cleanup";

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-09-24T12:00:00.000Z");

function fakes(over: {
  uploads?: unknown[];
  postExists?: boolean;
  removeImpl?: () => Promise<void>;
} = {}) {
  const payload = {
    find: vi.fn().mockImplementation(({ collection }) => {
      if (collection === "video-uploads") {
        return Promise.resolve({ docs: over.uploads ?? [] });
      }
      throw new Error(`unexpected find on ${String(collection)}`);
    }),
    count: vi.fn().mockResolvedValue({ totalDocs: over.postExists ? 1 : 0 }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const storage = {
    remove: vi.fn().mockImplementation(over.removeImpl ?? (() => Promise.resolve(undefined))),
  };
  return {
    payload,
    storage,
    deps: { payload: payload as never, storage: storage as never, now: () => NOW },
  };
}

const grant = (over: Record<string, unknown> = {}) => ({
  id: 1,
  uploadId: UPLOAD,
  communityId: "c1",
  visibility: "community",
  ...over,
});

describe("cleanupAbandonedUploads", () => {
  it("deletes files and grants for uploads unfinished after 24 hours", async () => {
    const { payload, storage, deps } = fakes({ uploads: [grant()] });
    await expect(cleanupAbandonedUploads(deps)).resolves.toEqual({ removed: 1, failed: 0 });
    expect(payload.find.mock.calls[0]![0].where).toEqual({
      and: [
        { finishedAt: { exists: false } },
        { createdAt: { less_than: "2026-09-23T12:00:00.000Z" } },
      ],
    });
    expect(storage.remove).toHaveBeenCalledWith([
      `private/videos/c1/${UPLOAD}.mp4`,
      `private/videos/c1/${UPLOAD}.jpg`,
    ]);
    expect(payload.delete).toHaveBeenCalledWith({ collection: "video-uploads", id: 1 });
  });

  it("keeps the files and just finishes the grant when a post already owns the video key", async () => {
    const { payload, storage, deps } = fakes({ uploads: [grant()], postExists: true });
    await expect(cleanupAbandonedUploads(deps)).resolves.toEqual({ removed: 0, failed: 0 });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: { "video.key": { equals: `private/videos/c1/${UPLOAD}.mp4` } },
    });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.update).toHaveBeenCalledWith({
      collection: "video-uploads",
      id: 1,
      data: { finishedAt: NOW.toISOString() },
    });
  });

  it("keeps a grant and continues after a storage failure, without aborting the run", async () => {
    const { payload, storage, deps } = fakes({
      uploads: [grant({ id: 1 }), grant({ id: 2, uploadId: "2b4e28ba-2fa1-41d2-883f-0016d3cca427" })],
    });
    storage.remove
      .mockRejectedValueOnce(new Error("s3 boom"))
      .mockResolvedValueOnce(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(cleanupAbandonedUploads(deps)).resolves.toEqual({ removed: 1, failed: 1 });
    expect(payload.delete).toHaveBeenCalledTimes(1);
    expect(payload.delete).toHaveBeenCalledWith({ collection: "video-uploads", id: 2 });
    expect(errorSpy).toHaveBeenCalledWith(
      "[video-uploads-cleanup] failed",
      expect.objectContaining({ uploadId: UPLOAD }),
    );
    errorSpy.mockRestore();
  });
});
