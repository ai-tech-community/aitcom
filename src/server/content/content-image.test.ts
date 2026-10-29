import { describe, expect, it } from "vitest";

import {
  contentImageChoice,
  contentImageColumns,
  isHttpImageUrl,
} from "./content-image";

describe("content image", () => {
  it("accepts an http(s) URL and refuses other schemes", () => {
    expect(isHttpImageUrl("https://cdn.example.test/a.png")).toBe(true);
    expect(isHttpImageUrl("http://cdn.example.test/a.png")).toBe(true);
    expect(isHttpImageUrl("ftp://cdn.example.test/a.png")).toBe(false);
    expect(isHttpImageUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpImageUrl(" https://cdn.example.test/a.png")).toBe(false);
  });

  it("stores a media id without also requiring a URL from the caller", () => {
    const choice = contentImageChoice({
      mediaId: 12,
      alt: "  Town square  ",
    });
    expect(choice).toEqual({
      kind: "media",
      mediaId: 12,
      alt: "Town square",
    });
    expect(
      contentImageColumns(choice, {
        url: "https://cdn.example.test/12.png",
        alt: "From media",
      }),
    ).toEqual({
      mediaId: 12,
      url: "https://cdn.example.test/12.png",
      alt: "Town square",
    });
  });

  it("stores a URL and clears any media id", () => {
    const choice = contentImageChoice({
      url: "https://cdn.example.test/banner.png",
    });
    expect(contentImageColumns(choice)).toEqual({
      mediaId: null,
      url: "https://cdn.example.test/banner.png",
      alt: null,
    });
  });

  it("refuses a media id and a URL together", () => {
    expect(() =>
      contentImageChoice({
        mediaId: 4,
        url: "https://cdn.example.test/a.png",
      }),
    ).toThrow(/not both/);
  });

  it("refuses a URL that is not http(s)", () => {
    expect(() => contentImageChoice({ url: "file:///etc/passwd" })).toThrow(
      /http\(s\)/,
    );
  });

  it("clears the picture when the media id or URL is null", () => {
    expect(contentImageColumns(contentImageChoice({ mediaId: null }))).toEqual({
      mediaId: null,
      url: null,
      alt: null,
    });
    expect(
      contentImageColumns(contentImageChoice({ url: null, alt: "Gone" })),
    ).toEqual({
      mediaId: null,
      url: null,
      alt: "Gone",
    });
  });

  it("can change alt text without clearing the picture", () => {
    expect(
      contentImageColumns(contentImageChoice({ alt: "Masthead" })),
    ).toEqual({
      alt: "Masthead",
    });
    expect(contentImageChoice({})).toEqual({ kind: "absent" });
  });

  it("uses the media alt when the caller omits alt text", () => {
    const choice = contentImageChoice({ mediaId: 3 });
    expect(
      contentImageColumns(choice, {
        url: "https://cdn.example.test/3.png",
        alt: "Uploaded alt",
      }),
    ).toEqual({
      mediaId: 3,
      url: "https://cdn.example.test/3.png",
      alt: "Uploaded alt",
    });
  });
});
