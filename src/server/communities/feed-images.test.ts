import { beforeEach, describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  readBodyCapped: vi.fn(),
}));
vi.mock("@/server/net/safe-fetch", () => net);

import {
  claimFeedImages,
  cleanUpPostImages,
  fetchImage,
  importFeedImage,
} from "./feed-images";
import {
  feedPostImageUrlBeforeChange,
  unlinkFeedPostsBeforeMediaDelete,
} from "./feed-post-image-url-hook";

function fakePayload() {
  return {
    create: vi.fn().mockResolvedValue({ id: 31, url: "https://ours/x.png" }),
    delete: vi.fn().mockResolvedValue({ docs: [] }),
    findByID: vi.fn(),
    find: vi.fn().mockResolvedValue({ docs: [] }),
    count: vi.fn().mockResolvedValue({ totalDocs: 0 }),
    update: vi.fn().mockResolvedValue({}),
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
        alt: "",
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

describe("claimFeedImages", () => {
  const own = (id: number, alt = "") => ({
    id,
    url: `https://ours/${id}.png`,
    alt,
    uploadedBy: "u1",
    purpose: "feed-post",
  });

  it("claims the member's own pictures in order and saves new descriptions", async () => {
    const payload = fakePayload();
    payload.find.mockResolvedValue({ docs: [own(2, "old"), own(1)] });
    const images = await claimFeedImages(payload as never, {
      images: [
        { id: 1, alt: " A cat on a desk " },
        { id: 2, alt: "old" },
      ],
      userId: "u1",
      postId: 9,
    });
    expect(images).toEqual([
      { id: 1, url: "https://ours/1.png" },
      { id: 2, url: "https://ours/2.png" },
    ]);
    expect(payload.count).toHaveBeenCalledWith({
      collection: "feed-posts",
      where: { and: [{ images: { in: [1, 2] } }, { id: { not_equals: 9 } }] },
    });
    expect(payload.update).toHaveBeenCalledTimes(1);
    expect(payload.update).toHaveBeenCalledWith({
      collection: "media",
      id: 1,
      data: { alt: "A cat on a desk" },
      depth: 0,
    });
  });

  it("refuses someone else's picture, a shared upload, one on another post, repeats and more than four", async () => {
    const cases: [unknown[], { id: number; alt: string }[], number][] = [
      [[{ ...own(1), uploadedBy: "u2" }], [{ id: 1, alt: "" }], 0],
      [[{ ...own(1), purpose: null }], [{ id: 1, alt: "" }], 0],
      [[own(1)], [{ id: 1, alt: "" }], 1],
      [
        [own(1)],
        [
          { id: 1, alt: "" },
          { id: 1, alt: "" },
        ],
        0,
      ],
      [
        [1, 2, 3, 4, 5].map((id) => own(id)),
        [1, 2, 3, 4, 5].map((id) => ({ id, alt: "" })),
        0,
      ],
    ];
    for (const [docs, images, usedElsewhere] of cases) {
      const payload = fakePayload();
      payload.find.mockResolvedValue({ docs });
      payload.count.mockResolvedValue({ totalDocs: usedElsewhere });
      await expect(
        claimFeedImages(payload as never, { images, userId: "u1" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
});

describe("cleanUpPostImages", () => {
  it("deletes only the feed post pictures the post no longer uses", async () => {
    const payload = fakePayload();
    await cleanUpPostImages(
      payload as never,
      { id: 5, images: [1, { id: 2 }, 3] },
      [2],
      { context: "test" },
    );
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "media",
      where: {
        and: [{ id: { in: [1, 3] } }, { purpose: { equals: "feed-post" } }],
      },
    });
  });

  it("logs a failure instead of throwing, and does nothing when all are kept", async () => {
    const payload = fakePayload();
    await cleanUpPostImages(payload as never, { id: 5, images: [1] }, [1], {
      context: "test",
    });
    expect(payload.delete).not.toHaveBeenCalled();
    const log = vi.fn();
    payload.delete.mockRejectedValueOnce(new Error("s3 down"));
    await expect(
      cleanUpPostImages(payload as never, { id: 5, images: [1] }, [], {
        context: "test",
        log,
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[test] image cleanup failed", {
      postId: 5,
      imageIds: [1],
      error: expect.any(Error),
    });
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

  it("copies the URL of the new first picture", async () => {
    const { result } = run({ images: [7, 8] }, { images: [] });
    await expect(result).resolves.toMatchObject({
      imageUrl: "https://ours/7.png",
    });
  });

  it("clears the URL when the pictures are removed", async () => {
    const { result, findByID } = run(
      { images: [] },
      { images: [7], imageUrl: "https://ours/7.png" },
    );
    await expect(result).resolves.toMatchObject({ imageUrl: null });
    expect(findByID).not.toHaveBeenCalled();
  });

  it("keeps a legacy URL-only picture through a save with an empty list (Payload admin)", async () => {
    const { result } = run(
      { images: [], content: "edited" },
      { images: [], imageUrl: "https://elsewhere/p.png" },
    );
    await expect(result).resolves.toEqual({ images: [], content: "edited" });
  });

  it("leaves the URL alone when the first picture stays, or the write does not set pictures", async () => {
    const same = run({ images: [7, 9] }, { images: [7], imageUrl: "u" });
    await expect(same.result).resolves.toEqual({ images: [7, 9], image: 7 });
    expect(same.findByID).not.toHaveBeenCalled();
    const untouched = run({ content: "x" }, { images: [7], imageUrl: "u" });
    await expect(untouched.result).resolves.toEqual({ content: "x" });
  });
});

describe("unlinkFeedPostsBeforeMediaDelete", () => {
  it("takes the picture out of every post that shows it, in the same request", async () => {
    const find = vi.fn().mockResolvedValue({
      docs: [
        { id: 5, content: "Two pictures", images: [66, 67] },
        { id: 6, content: "One picture", images: [{ id: 66 }] },
        // Only this picture and no words: nothing would be left.
        { id: 7, content: "", images: [66] },
      ],
    });
    const update = vi.fn().mockResolvedValue({});
    const req = { payload: { find, update } };
    await unlinkFeedPostsBeforeMediaDelete()({ id: 66, req } as never);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { images: { in: [66] } }, req }),
    );
    expect(update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 5,
      data: { images: [67] },
      depth: 0,
      req,
    });
    expect(update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 6,
      data: { images: [] },
      depth: 0,
      req,
    });
    expect(update).toHaveBeenCalledWith({
      collection: "feed-posts",
      id: 7,
      data: {
        images: [],
        imageUrl: null,
        image: null,
        isDeleted: true,
        content: "",
      },
      depth: 0,
      req,
    });
  });
});
