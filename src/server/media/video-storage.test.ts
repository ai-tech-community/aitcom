import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPresignedPost, getSignedUrl } = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  getSignedUrl: vi.fn(),
}));
vi.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

import { createVideoStorage } from "./video-storage";

function setup() {
  const send = vi.fn();
  const storage = createVideoStorage({
    client: { send } as never,
    bucket: "ait-media",
    region: "eu-central-1",
  });
  return { storage, send };
}

beforeEach(() => {
  createPresignedPost.mockReset();
  getSignedUrl.mockReset();
});

describe("video storage", () => {
  it("grants one key, one type, a size range, for ten minutes", async () => {
    createPresignedPost.mockResolvedValue({
      url: "https://s3/",
      fields: { key: "k" },
    });
    const { storage } = setup();
    await expect(
      storage.presignUpload({
        key: "private/videos/c/u.mp4",
        contentType: "video/mp4",
        maxBytes: 100,
      }),
    ).resolves.toEqual({ url: "https://s3/", fields: { key: "k" } });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.anything(), {
      Bucket: "ait-media",
      Key: "private/videos/c/u.mp4",
      Conditions: [
        ["content-length-range", 1, 100],
        ["eq", "$Content-Type", "video/mp4"],
      ],
      Fields: { "Content-Type": "video/mp4" },
      Expires: 600,
    });
  });

  it("links public videos directly and signs private ones for an hour", async () => {
    getSignedUrl.mockResolvedValue("https://signed");
    const { storage } = setup();
    await expect(
      storage.playbackUrl("media/videos/public/c/u.mp4", "public"),
    ).resolves.toBe(
      "https://ait-media.s3.eu-central-1.amazonaws.com/media/videos/public/c/u.mp4",
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
    await expect(
      storage.playbackUrl("private/videos/c/u.mp4", "private"),
    ).resolves.toBe("https://signed");
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 3600 + 1800 }),
    );
  });

  it("keeps a private link identical within one 30-minute window", async () => {
    getSignedUrl.mockImplementation(
      async (
        _client: unknown,
        _command: unknown,
        options: { signingDate: Date; expiresIn: number },
      ) =>
        `https://signed?d=${options.signingDate.toISOString()}&e=${options.expiresIn}`,
    );
    let now = Date.parse("2026-09-24T10:31:00.000Z");
    const storage = createVideoStorage({
      client: { send: vi.fn() } as never,
      bucket: "ait-media",
      region: "eu-central-1",
      now: () => now,
    });
    const first = await storage.playbackUrl(
      "private/videos/c/u.mp4",
      "private",
    );
    now = Date.parse("2026-09-24T10:59:59.000Z");
    const second = await storage.playbackUrl(
      "private/videos/c/u.mp4",
      "private",
    );
    expect(second).toBe(first);
    expect(getSignedUrl).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      {
        expiresIn: 5400,
        signingDate: new Date("2026-09-24T10:30:00.000Z"),
      },
    );
    now = Date.parse("2026-09-24T11:00:00.000Z");
    const third = await storage.playbackUrl(
      "private/videos/c/u.mp4",
      "private",
    );
    expect(third).not.toBe(first);
    expect(getSignedUrl).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      {
        expiresIn: 5400,
        signingDate: new Date("2026-09-24T11:00:00.000Z"),
      },
    );
  });

  it("inspects an object, and reports a missing one as null", async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({ ContentType: "video/mp4", ContentLength: 42 });
    await expect(storage.inspect("k")).resolves.toEqual({
      contentType: "video/mp4",
      bytes: 42,
    });
    send.mockRejectedValueOnce(
      Object.assign(new Error("nf"), { name: "NotFound" }),
    );
    await expect(storage.inspect("k")).resolves.toBeNull();
    send.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { name: "AccessDenied" }),
    );
    await expect(storage.inspect("k")).rejects.toThrow("boom");
  });

  it("removes several objects in one call and skips an empty list", async () => {
    const { storage, send } = setup();
    await storage.remove([]);
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValue({});
    await storage.remove(["a", "b"]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].input).toEqual({
      Bucket: "ait-media",
      Delete: { Objects: [{ Key: "a" }, { Key: "b" }], Quiet: true },
    });
  });

  it("rejects when S3 reports a partial delete failure", async () => {
    const { storage, send } = setup();
    send.mockResolvedValue({
      Errors: [{ Key: "a", Code: "AccessDenied" }],
    });
    await expect(storage.remove(["a", "b"])).rejects.toThrow(/a.*AccessDenied/);
  });
});
