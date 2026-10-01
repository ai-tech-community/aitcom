import { beforeEach, describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  readBodyCapped: vi.fn(),
}));
vi.mock("@/server/net/safe-fetch", () => net);

import { cleanUpPostImage, fetchImage, importFeedImage } from "./feed-images";
import {
  feedPostImageUrlBeforeChange,
  unlinkFeedPostsBeforeMediaDelete,
} from "./feed-post-image-url-hook";

function fakePayload() {
  return {
    create: vi.fn().mockResolvedValue({ id: 31, url: "https://ours/x.png" }),
    delete: vi.fn().mockResolvedValue({ docs: [] }),
    findByID: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("fetchImage", () => {
  const reply = (type: string, ok = true) => ({
    response: {
      ok,
      status: ok ? 200 : 404,
      headers: new Headers({ "content-type": type }),
      body: { cancel: vi.fn() },
    },
    url: "https://cdn.example/p.png",
  });

  it("downloads an image behind the SSRF guard within the size limit", async () => {
    net.safeFetch.mockResolvedValue(reply("image/png; charset=binary"));
    net.readBodyCapped.mockResolvedValue(Buffer.from("png"));
    await expect(fetchImage("https://cdn.example/p.png")).resolves.toEqual({
      data: Buffer.from("png"),
      mimetype: "image/png",
    });
    expect(net.readBodyCapped).toHaveBeenCalledWith(
      expect.anything(),
      2 * 1024 * 1024,
    );
  });

  it("refuses what is not a picture we store, and failed requests", async () => {
    for (const type of ["text/html", "image/svg+xml", ""]) {
      net.safeFetch.mockResolvedValue(reply(type));
      await expect(fetchImage("https://x.example/a")).rejects.toThrow(
        /Not an importable image/,
      );
    }
    net.safeFetch.mockResolvedValue(reply("image/png", false));
    await expect(fetchImage("https://x.example/a")).rejects.toThrow(/404/);
    expect(net.readBodyCapped).not.toHaveBeenCalled();
  });
});

describe("importFeedImage", () => {
  it("stores the picture as the owner's feed post image", async () => {
    const payload = fakePayload();
    const image = await importFeedImage(
      payload as never,
      { url: "https://cdn.example/p.png", userId: "owner-1" },
      async () => ({ data: Buffer.from("png"), mimetype: "image/png" }),
    );
    expect(image).toEqual({ id: 31, url: "https://ours/x.png" });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "media",
      data: {
        alt: "Feed post image",
        uploadedBy: "owner-1",
        purpose: "feed-post",
      },
      file: {
        data: Buffer.from("png"),
        name: "feed-image.png",
        mimetype: "image/png",
        size: 3,
      },
    });
  });

  it("answers in plain words when the picture cannot be loaded", async () => {
    const payload = fakePayload();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      importFeedImage(
        payload as never,
        { url: "http://169.254.169.254/", userId: "owner-1" },
        async () => {
          throw new Error("Refusing to fetch URL: private address");
        },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("couldn't load the picture"),
    });
    expect(payload.create).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("cleanUpPostImage", () => {
  it("deletes only a feed post image, and logs a failure instead of throwing", async () => {
    const payload = fakePayload();
    await cleanUpPostImage(
      payload as never,
      { id: 5, image: { id: 66 } as never },
      { context: "test" },
    );
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { equals: 66 } }, { purpose: { equals: "feed-post" } }],
      },
    });
    const log = vi.fn();
    payload.delete.mockRejectedValueOnce(new Error("s3 down"));
    await expect(
      cleanUpPostImage(
        payload as never,
        { id: 5, image: 66 },
        { context: "test", log },
      ),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[test] image cleanup failed", {
      postId: 5,
      imageId: 66,
      error: expect.any(Error),
    });
  });

  it("does nothing for a post without an image", async () => {
    const payload = fakePayload();
    await cleanUpPostImage(
      payload as never,
      { id: 5, image: null },
      {
        context: "test",
      },
    );
    expect(payload.delete).not.toHaveBeenCalled();
  });
});

describe("feedPostImageUrlBeforeChange", () => {
  const hook = feedPostImageUrlBeforeChange();
  const run = (
    data: Record<string, unknown>,
    originalDoc?: Record<string, unknown>,
    media: unknown = { id: 7, url: "https://ours/7.png" },
  ) => {
    const findByID = vi.fn().mockResolvedValue(media);
    const result = hook({
      data,
      originalDoc,
      req: { payload: { findByID } },
    } as never) as Promise<Record<string, unknown>>;
    return { result, findByID };
  };

  it("writes the URL of a newly linked image", async () => {
    const { result } = run({ image: 7 }, { image: null });
    await expect(result).resolves.toMatchObject({
      imageUrl: "https://ours/7.png",
    });
  });

  it("clears the URL when the linked image is removed", async () => {
    const { result, findByID } = run(
      { image: null },
      { image: 7, imageUrl: "https://ours/7.png" },
    );
    await expect(result).resolves.toMatchObject({ imageUrl: null });
    expect(findByID).not.toHaveBeenCalled();
  });

  it("keeps a legacy URL-only picture through a save with an empty image (Payload admin)", async () => {
    const { result } = run(
      { image: null, content: "edited" },
      { image: null, imageUrl: "https://elsewhere/p.png" },
    );
    await expect(result).resolves.toEqual({ image: null, content: "edited" });
  });

  it("leaves the URL alone when a write does not set the image", async () => {
    const { result, findByID } = run(
      { content: "edited" },
      { image: null, imageUrl: "https://elsewhere/p.png" },
    );
    await expect(result).resolves.toEqual({ content: "edited" });
    expect(findByID).not.toHaveBeenCalled();
  });

  it("does not look the image up again when it did not change", async () => {
    const { result, findByID } = run(
      { image: 7 },
      { image: 7, imageUrl: "https://ours/7.png" },
    );
    await expect(result).resolves.toEqual({ image: 7 });
    expect(findByID).not.toHaveBeenCalled();
  });
});

describe("unlinkFeedPostsBeforeMediaDelete", () => {
  it("unlinks every post showing the image, in the same request", async () => {
    const update = vi.fn().mockResolvedValue({ docs: [] });
    const req = { payload: { update } };
    await unlinkFeedPostsBeforeMediaDelete()({ id: 66, req } as never);
    expect(update).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: { image: { equals: 66 } },
      data: { image: null },
      depth: 0,
      req,
    });
  });
});
