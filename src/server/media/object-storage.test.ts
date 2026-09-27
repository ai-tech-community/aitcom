import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPresignedPost, getSignedUrl } = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
  getSignedUrl: vi.fn(),
}));
vi.mock("@aws-sdk/s3-presigned-post", () => ({ createPresignedPost }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

import { contentDisposition, createObjectStorage } from "./object-storage";

const KEY = "private/classroom/c1/12/1b4e28ba-2fa1-41d2-883f-0016d3cca427.pdf";

function setup(now?: () => number) {
  const send = vi.fn();
  const storage = createObjectStorage({
    client: { send } as never,
    bucket: "ait-media",
    region: "eu-central-1",
    now,
  });
  return { storage, send };
}

/** The GetObject input the last signed link was built from. */
function lastSignedInput(): Record<string, unknown> {
  return (getSignedUrl.mock.lastCall![1] as { input: Record<string, unknown> })
    .input;
}

beforeEach(() => {
  createPresignedPost.mockReset();
  getSignedUrl.mockReset();
  getSignedUrl.mockResolvedValue("https://signed");
});

describe("object storage", () => {
  it("grants one key, one type and a size range, for ten minutes", async () => {
    createPresignedPost.mockResolvedValue({
      url: "https://s3/",
      fields: { key: KEY },
    });
    const { storage } = setup();
    await expect(
      storage.presignUpload({
        key: KEY,
        contentType: "application/pdf",
        maxBytes: 2048,
      }),
    ).resolves.toEqual({ url: "https://s3/", fields: { key: KEY } });
    expect(createPresignedPost).toHaveBeenCalledWith(expect.anything(), {
      Bucket: "ait-media",
      Key: KEY,
      Conditions: [
        ["content-length-range", 1, 2048],
        ["eq", "$Content-Type", "application/pdf"],
      ],
      Fields: { "Content-Type": "application/pdf" },
      Expires: 600,
    });
  });

  it("builds a public address without signing", () => {
    const { storage } = setup();
    expect(storage.publicUrl("media/videos/public/c/u.mp4")).toBe(
      "https://ait-media.s3.eu-central-1.amazonaws.com/media/videos/public/c/u.mp4",
    );
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a plain link at the start of a 30-minute window, valid an hour past it", async () => {
    let now = Date.parse("2026-09-28T10:31:00.000Z");
    const { storage } = setup(() => now);
    await expect(storage.signedGetUrl(KEY)).resolves.toBe("https://signed");
    now = Date.parse("2026-09-28T10:59:59.000Z");
    await storage.signedGetUrl(KEY);
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
    for (const call of getSignedUrl.mock.calls) {
      expect(call[2]).toEqual({
        expiresIn: 5400,
        signingDate: new Date("2026-09-28T10:30:00.000Z"),
      });
    }
    expect(lastSignedInput()).toEqual({ Bucket: "ait-media", Key: KEY });
  });

  it("asks S3 to answer with the download name and the file type", async () => {
    const { storage } = setup();
    await storage.signedGetUrl(KEY, {
      downloadName: "Week 1 — slides.pdf",
      disposition: "attachment",
      contentType: "application/pdf",
    });
    expect(lastSignedInput()).toEqual({
      Bucket: "ait-media",
      Key: KEY,
      ResponseContentDisposition: `attachment; filename="Week 1 _ slides.pdf"; filename*=UTF-8''Week%201%20%E2%80%94%20slides.pdf`,
      ResponseContentType: "application/pdf",
    });
  });

  it("uses attachment when only a name is given, and inline when asked", async () => {
    const { storage } = setup();
    await storage.signedGetUrl(KEY, { downloadName: "a.pdf" });
    expect(lastSignedInput().ResponseContentDisposition).toBe(
      `attachment; filename="a.pdf"; filename*=UTF-8''a.pdf`,
    );
    await storage.signedGetUrl(KEY, {
      downloadName: "a.pdf",
      disposition: "inline",
    });
    expect(lastSignedInput().ResponseContentDisposition).toBe(
      `inline; filename="a.pdf"; filename*=UTF-8''a.pdf`,
    );
  });

  it("inspects an object, and reports a missing one as null", async () => {
    const { storage, send } = setup();
    send.mockResolvedValueOnce({
      ContentType: "application/pdf",
      ContentLength: 42,
    });
    await expect(storage.inspect(KEY)).resolves.toEqual({
      contentType: "application/pdf",
      bytes: 42,
    });
    send.mockRejectedValueOnce(
      Object.assign(new Error("nf"), { name: "NotFound" }),
    );
    await expect(storage.inspect(KEY)).resolves.toBeNull();
    send.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { name: "AccessDenied" }),
    );
    await expect(storage.inspect(KEY)).rejects.toThrow("boom");
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
    send.mockResolvedValue({ Errors: [{ Key: "a", Code: "AccessDenied" }] });
    await expect(storage.remove(["a", "b"])).rejects.toThrow(/a.*AccessDenied/);
  });
});

describe("contentDisposition", () => {
  it.each([
    [
      "attachment",
      "Handout.pdf",
      `attachment; filename="Handout.pdf"; filename*=UTF-8''Handout.pdf`,
    ],
    [
      "inline",
      "Plan (v2) 'final'.pdf",
      `inline; filename="Plan (v2) 'final'.pdf"; filename*=UTF-8''Plan%20%28v2%29%20%27final%27.pdf`,
    ],
    [
      "attachment",
      'Say "hi".pdf',
      `attachment; filename="Say _hi_.pdf"; filename*=UTF-8''Say%20%22hi%22.pdf`,
    ],
    [
      "attachment",
      "Überblick.pdf",
      `attachment; filename="_berblick.pdf"; filename*=UTF-8''%C3%9Cberblick.pdf`,
    ],
  ] as const)("%s %s", (disposition, name, header) => {
    expect(contentDisposition(disposition, name)).toBe(header);
  });
});
