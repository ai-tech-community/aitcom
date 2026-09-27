import { describe, expect, it } from "vitest";

import { firstLink, splitTextIntoLinks } from "./links";

describe("splitTextIntoLinks", () => {
  it("splits text around a link and keeps every character", () => {
    const text =
      "Grok Bot cheat sheet https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9 enjoy";
    const segments = splitTextIntoLinks(text);
    expect(segments).toEqual([
      { kind: "text", text: "Grok Bot cheat sheet " },
      {
        kind: "link",
        text: "https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9",
        href: "https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9",
      },
      { kind: "text", text: " enjoy" },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
  });

  it("leaves sentence punctuation outside the link", () => {
    const segments = splitTextIntoLinks("See https://example.com/a, then go.");
    expect(segments[1]).toMatchObject({ href: "https://example.com/a" });
    expect(segments[2]).toEqual({ kind: "text", text: ", then go." });
  });

  it("drops an unbalanced closing bracket but keeps a balanced one", () => {
    expect(firstLink("(https://example.com/a)")).toBe("https://example.com/a");
    expect(firstLink("https://en.wikipedia.org/wiki/Mars_(planet)")).toBe(
      "https://en.wikipedia.org/wiki/Mars_(planet)",
    );
  });

  it("finds several links", () => {
    const links = splitTextIntoLinks(
      "a http://one.example.com b\nhttps://two.example.com/x?y=1#z",
    ).filter((s) => s.kind === "link");
    expect(links.map((s) => s.kind === "link" && s.href)).toEqual([
      "http://one.example.com/",
      "https://two.example.com/x?y=1#z",
    ]);
  });

  it("ignores non-web schemes and hosts without a dot", () => {
    expect(
      splitTextIntoLinks("javascript:alert(1) https://localhost/x"),
    ).toEqual([
      { kind: "text", text: "javascript:alert(1) https://localhost/x" },
    ]);
  });

  it("returns plain text unchanged", () => {
    expect(splitTextIntoLinks("no links here")).toEqual([
      { kind: "text", text: "no links here" },
    ]);
    expect(splitTextIntoLinks("")).toEqual([]);
  });
});

describe("firstLink", () => {
  it("returns the first link or null", () => {
    expect(firstLink("x https://a.example.com y https://b.example.com")).toBe(
      "https://a.example.com/",
    );
    expect(firstLink("nothing")).toBeNull();
  });
});
