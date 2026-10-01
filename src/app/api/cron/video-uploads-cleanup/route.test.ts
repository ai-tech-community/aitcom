// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  videos: vi.fn(),
  materials: vi.fn(),
  unused: vi.fn(),
  ownsStorage: vi.fn(),
  getVideoStorage: vi.fn(),
  getObjectStorage: vi.fn(),
  payload: { name: "payload" },
}));

vi.mock("@/server/communities/video-uploads-cleanup", () => ({
  cleanupAbandonedUploads: m.videos,
}));
vi.mock("@/server/media/storage-ownership", () => ({
  ownsStorageContents: m.ownsStorage,
}));
vi.mock("@/server/communities/unused-video-files-sweep", () => ({
  sweepUnusedVideoFiles: m.unused,
}));
vi.mock("@/server/classroom/material-uploads-cleanup", () => ({
  cleanupAbandonedMaterialUploads: m.materials,
}));
vi.mock("@/server/media/video-storage", () => ({
  getVideoStorage: m.getVideoStorage,
}));
vi.mock("@/server/media/object-storage", () => ({
  getObjectStorage: m.getObjectStorage,
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => m.payload,
}));

import { GET } from "./route";

const CRON_URL = "https://app.test/api/cron/video-uploads-cleanup";
const authorized = () =>
  new Request(CRON_URL, { headers: { authorization: "Bearer cron-secret" } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
  m.videos.mockResolvedValue({ removed: 1, failed: 0 });
  m.materials.mockResolvedValue({ removed: 2, failed: 1 });
  m.unused.mockResolvedValue({ scanned: 9, removed: 3, failed: 0 });
  m.ownsStorage.mockReturnValue(true);
});

describe("video-uploads-cleanup cron", () => {
  it("refuses a caller without the cron secret", async () => {
    const res = await GET(new Request(CRON_URL));
    expect(res.status).toBe(401);
    expect(m.videos).not.toHaveBeenCalled();
    expect(m.materials).not.toHaveBeenCalled();
  });

  it("refuses a caller with the wrong cron secret", async () => {
    const res = await GET(
      new Request(CRON_URL, { headers: { authorization: "Bearer nope" } }),
    );
    expect(res.status).toBe(401);
    expect(m.videos).not.toHaveBeenCalled();
    expect(m.materials).not.toHaveBeenCalled();
  });

  it("sweeps abandoned video and classroom file uploads, handing storage over lazily", async () => {
    const res = await GET(authorized());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      removed: 1,
      failed: 0,
      materials: { removed: 2, failed: 1 },
      unusedVideoFiles: { scanned: 9, removed: 3, failed: 0 },
    });
    expect(m.unused).toHaveBeenCalledWith({
      payload: m.payload,
      storage: m.getObjectStorage,
    });
    expect(m.videos).toHaveBeenCalledWith({
      payload: m.payload,
      storage: m.getVideoStorage,
    });
    expect(m.materials).toHaveBeenCalledWith({
      payload: m.payload,
      storage: m.getObjectStorage,
    });
    expect(m.getObjectStorage).not.toHaveBeenCalled();
    expect(m.getVideoStorage).not.toHaveBeenCalled();
  });

  it("still sweeps classroom files when the video sweep throws, and reports the failure", async () => {
    m.videos.mockRejectedValue(new Error("db down"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const res = await GET(authorized());
    expect(m.materials).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      removed: null,
      failed: null,
      materials: { removed: 2, failed: 1 },
    });
    expect(error).toHaveBeenCalledWith(
      "[video-uploads-cleanup] videos sweep failed",
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("still sweeps videos when the classroom file sweep throws, and reports the failure", async () => {
    m.materials.mockRejectedValue(new Error("db down"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const res = await GET(authorized());
    expect(m.videos).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      removed: 1,
      failed: 0,
      materials: null,
    });
    expect(error).toHaveBeenCalledWith(
      "[video-uploads-cleanup] materials sweep failed",
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("reports a failed unused-file sweep without losing the other results", async () => {
    m.unused.mockRejectedValue(new Error("s3 down"));
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const res = await GET(authorized());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      removed: 1,
      materials: { removed: 2, failed: 1 },
      unusedVideoFiles: null,
    });
    expect(error).toHaveBeenCalledWith(
      "[video-uploads-cleanup] unused video files sweep failed",
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("skips the unused-file sweep outside production, which shares the bucket", async () => {
    m.ownsStorage.mockReturnValue(false);
    const res = await GET(authorized());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      unusedVideoFiles: { skipped: "not production" },
    });
    expect(m.unused).not.toHaveBeenCalled();
    expect(m.videos).toHaveBeenCalledTimes(1);
  });
});
