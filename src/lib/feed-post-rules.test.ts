import { describe, expect, it } from "vitest";

import { carriesMedia, mayGoWithoutWords } from "./feed-post-rules";

describe("carriesMedia", () => {
  it("is false for a post that carries nothing", () => {
    expect(carriesMedia({})).toBe(false);
    expect(
      carriesMedia({
        images: [],
        image: null,
        imageUrl: null,
        gif: { giphyId: null },
        video: { key: null },
      }),
    ).toBe(false);
  });

  it("is true for pictures, a legacy picture, a GIF or a video", () => {
    expect(carriesMedia({ images: [3] })).toBe(true);
    expect(carriesMedia({ image: 3 })).toBe(true);
    expect(carriesMedia({ imageUrl: "https://example.com/a.png" })).toBe(true);
    expect(carriesMedia({ gif: { giphyId: "abc" } })).toBe(true);
    expect(carriesMedia({ video: { key: "videos/a.mp4" } })).toBe(true);
  });

  it("is true for a post that announces a gallery batch", () => {
    expect(carriesMedia({ galleryBatch: 7 })).toBe(true);
    expect(carriesMedia({ galleryBatch: { id: 7 } })).toBe(true);
  });

  it("is false when the gallery batch is cleared", () => {
    expect(carriesMedia({ galleryBatch: null })).toBe(false);
    expect(carriesMedia({ galleryBatch: undefined })).toBe(false);
  });
});

describe("mayGoWithoutWords", () => {
  it("lets a gallery post go without words: its items carry their own descriptions", () => {
    expect(mayGoWithoutWords({ gallery: true })).toBe(true);
  });

  it("still needs words for a post with nothing that speaks for it", () => {
    expect(mayGoWithoutWords({})).toBe(false);
    expect(mayGoWithoutWords({ gallery: false, pictureAlts: [""] })).toBe(
      false,
    );
  });
});
