import { describe, expect, it } from "vitest";

import { mediaIdsForUrls, sharedMediaUrl } from "./shared-media-url";

function payload(media: Record<string, unknown> | null) {
  return {
    findByID: async () => media,
  };
}

describe("mediaIdsForUrls", () => {
  it("returns the media id stored for each URL and null when it is missing", () => {
    const ids = new Map([
      ["https://cdn.example.test/logo.png", 4],
      ["https://cdn.example.test/banner.png", 9],
    ]);
    expect(
      mediaIdsForUrls(
        {
          logoUrl: "https://cdn.example.test/logo.png",
          bannerUrl: "https://cdn.example.test/banner.png",
        },
        ids,
      ),
    ).toEqual({ logoMediaId: 4, bannerMediaId: 9 });
    expect(
      mediaIdsForUrls(
        { logoUrl: "https://elsewhere.test/a.png", bannerUrl: null },
        ids,
      ),
    ).toEqual({ logoMediaId: null, bannerMediaId: null });
  });
});

describe("sharedMediaUrl", () => {
  it("returns the stored URL for the owner's shared upload", async () => {
    const url = await sharedMediaUrl(
      payload({
        url: "https://cdn.example.test/banner.png",
        uploadedBy: "owner-1",
        purpose: null,
      }) as never,
      7,
      "owner-1",
    );
    expect(url).toBe("https://cdn.example.test/banner.png");
  });

  it("refuses a missing image, a feed-post image, and someone else's upload", async () => {
    await expect(
      sharedMediaUrl(payload(null) as never, 1, "owner-1"),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      sharedMediaUrl(
        payload({
          url: "https://cdn.example.test/a.png",
          uploadedBy: "owner-1",
          purpose: "feed-post",
        }) as never,
        2,
        "owner-1",
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      sharedMediaUrl(
        payload({
          url: "https://cdn.example.test/a.png",
          uploadedBy: "other",
          purpose: null,
        }) as never,
        3,
        "owner-1",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
