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
    createPresignedPost.mockResolvedValue({ url: "https://s3/", fields: { key: "k" } });
    const { storage } = setup();
    await expect(
      storage.presignUpload({ key: "private/videos/c/u.mp4", contentType: "video/mp4", maxBytes: 100 }),
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
    await expect(storage.playbackUrl("media/videos/public/c/u.mp4", "public")).resolves.toBe(
      "https://ait-media.s3.eu-central-1.amazonaws.com/media/videos/public/c/u.mp4",
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
    await expect(storage.playbackUrl("private/videos/c/u.mp4", "private")).resolves.toBe(
      "https://signed",
    );
    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 3600,
    });
  });

  it("inspects an object, and reports a missing one as null", async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({ ContentType: "video/mp4", ContentLength: 42 });
    await expect(storage.inspect("k")).resolves.toEqual({ contentType: "video/mp4", bytes: 42 });
    send.mockRejectedValueOnce(Object.assign(new Error("nf"), { name: "NotFound" }));
    await expect(storage.inspect("k")).resolves.toBeNull();
    send.mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "AccessDenied" }));
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
