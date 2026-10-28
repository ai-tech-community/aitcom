import { describe, expect, it } from "vitest";

import { sharedMediaUrl } from "./shared-media-url";

function payload(media: Record<string, unknown> | null) {
  return {
    findByID: async () => media,
  };
}

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
