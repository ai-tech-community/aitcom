import { describe, expect, it } from "vitest";

import {
  httpsImageUrl,
  markdownImagesOnly,
  splitMarkdownImages,
} from "./markdown-image";

describe("markdown images", () => {
  it("keeps an https image and its alt", () => {
    expect(
      splitMarkdownImages(
        "![Breakfast](https://aitcommunity.s3.amazonaws.com/day.jpg)",
      ),
    ).toEqual([
      {
        kind: "image",
        alt: "Breakfast",
        url: "https://aitcommunity.s3.amazonaws.com/day.jpg",
      },
    ]);
  });

  it("leaves http and javascript addresses as text", () => {
    const http = "![Breakfast](http://cdn.example.test/a.jpg)";
    const script = "![x](javascript:alert(1))";
    expect(splitMarkdownImages(http)).toEqual([{ kind: "text", text: http }]);
    expect(splitMarkdownImages(script)).toEqual([
      { kind: "text", text: script },
    ]);
    expect(httpsImageUrl("http://cdn.example.test/a.jpg")).toBeNull();
    expect(
      httpsImageUrl("https://user:pass@cdn.example.test/a.jpg"),
    ).toBeNull();
  });

  it("splits an image out of the surrounding sentence", () => {
    expect(
      splitMarkdownImages(
        "See ![the square](https://cdn.example.test/s.png) today.",
      ),
    ).toEqual([
      { kind: "text", text: "See " },
      {
        kind: "image",
        alt: "the square",
        url: "https://cdn.example.test/s.png",
      },
      { kind: "text", text: " today." },
    ]);
    expect(
      markdownImagesOnly(
        "![One](https://cdn.example.test/1.png)\n![Two](https://cdn.example.test/2.png)",
      ),
    ).toEqual([
      { kind: "image", alt: "One", url: "https://cdn.example.test/1.png" },
      { kind: "image", alt: "Two", url: "https://cdn.example.test/2.png" },
    ]);
    expect(
      markdownImagesOnly("See ![a](https://cdn.example.test/a.png)"),
    ).toBeNull();
  });
});
