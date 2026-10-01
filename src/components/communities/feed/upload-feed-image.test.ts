import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedImageUploadError, uploadFeedImage } from "./upload-feed-image";

afterEach(() => vi.unstubAllGlobals());

describe("uploadFeedImage", () => {
  it("uploads a feed picture with no description of its own", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 3, url: "https://s3.test/3.jpg" }),
    }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      uploadFeedImage(new File(["x"], "a.png", { type: "image/png" })),
    ).resolves.toEqual({ id: 3, url: "https://s3.test/3.jpg" });
    const body = (
      fetch.mock.calls[0] as unknown as [string, { body: FormData }]
    )[1].body;
    expect(body.get("alt")).toBe("");
    expect(body.get("purpose")).toBe("feed-post");
  });

  it("says a picture is too large without sending it, when it cannot be shrunk", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    // An animated GIF is never shrunk (a canvas would freeze it).
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "big.gif", {
      type: "image/gif",
    });
    await expect(uploadFeedImage(big)).rejects.toEqual(
      new FeedImageUploadError("tooLarge"),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
