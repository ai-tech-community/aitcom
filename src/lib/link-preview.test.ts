import { describe, expect, it } from "vitest";

import { readMeta } from "./html-meta";
import { isEmptyPreview, parseLinkPreview } from "./link-preview";

const PAGE = "https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9";

describe("parseLinkPreview", () => {
  it("reads OpenGraph tags", () => {
    const html = `<html><head>
      <title>Claude</title>
      <meta property="og:title" content="Grok Bot Cheatsheet">
      <meta property="og:description" content="One-page reference &amp; prompts">
      <meta property="og:image" content="https://cdn.example.com/thumb.img">
      <meta property="og:site_name" content="Claude">
    </head></html>`;
    expect(parseLinkPreview(html, PAGE)).toEqual({
      title: "Grok Bot Cheatsheet",
      description: "One-page reference & prompts",
      imageUrl: "https://cdn.example.com/thumb.img",
      siteName: "Claude",
    });
  });

  it("falls back to Twitter tags, then <title> and description", () => {
    const html = `<title> Plain  title </title>
      <meta name="description" content="Plain description">
      <meta name="twitter:image" content="/img/card.png">`;
    expect(parseLinkPreview(html, "https://example.com/post/1")).toEqual({
      title: "Plain title",
      description: "Plain description",
      imageUrl: "https://example.com/img/card.png",
      siteName: null,
    });
  });

  it("drops a non-https image", () => {
    const html = `<meta property="og:image" content="http://example.com/a.png">`;
    expect(parseLinkPreview(html, "http://example.com").imageUrl).toBeNull();
  });

  it("caps very long text", () => {
    const html = `<meta property="og:title" content="${"a".repeat(500)}">`;
    const { title } = parseLinkPreview(html, PAGE);
    expect(title).toHaveLength(200);
    expect(title?.endsWith("…")).toBe(true);
  });

  it("reports an empty page as empty", () => {
    expect(isEmptyPreview(parseLinkPreview("<html></html>", PAGE))).toBe(true);
  });
});

describe("readMeta", () => {
  it("keeps an apostrophe inside a double-quoted value", () => {
    expect(
      readMeta(`<meta property="og:title" content="Greg's guide">`, "og:title"),
    ).toBe("Greg's guide");
  });

  it("reads content before property, and numeric entities", () => {
    expect(
      readMeta(
        `<meta content='It&#8217;s &#x41;' property='og:title' />`,
        "og:title",
      ),
    ).toBe("It’s A");
  });

  it("does not confuse og:image with og:image:width", () => {
    expect(
      readMeta(
        `<meta property="og:image:width" content="1200"><meta property="og:image" content="https://x.example.com/a.png">`,
        "og:image",
      ),
    ).toBe("https://x.example.com/a.png");
  });
});
