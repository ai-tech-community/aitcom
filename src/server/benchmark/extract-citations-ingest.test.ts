import { describe, expect, it } from "vitest";
import { normalizeCitations } from "./extract-citations-ingest";

describe("normalizeCitations", () => {
  it("dedupes by url keeping first occurrence", () => {
    const result = normalizeCitations([
      { url: "https://a.com", domain: "a.com", position: 1 },
      { url: "https://a.com", domain: "a.com", position: 3 },
      { url: "https://b.com", domain: "b.com", position: 2 },
    ]);
    expect(result).toEqual([
      { url: "https://a.com", domain: "a.com", position: 1, title: null, snippet: null },
      { url: "https://b.com", domain: "b.com", position: 2, title: null, snippet: null },
    ]);
  });

  it("strips www. and lowercases the domain", () => {
    const result = normalizeCitations([
      { url: "https://WWW.Reddit.com/r/x", domain: "WWW.Reddit.com", position: 1 },
    ]);
    expect(result[0]?.domain).toBe("reddit.com");
  });

  it("clamps snippet to 280 chars", () => {
    const long = "x".repeat(500);
    const result = normalizeCitations([
      { url: "https://a.com", domain: "a.com", position: 1, snippet: long },
    ]);
    expect(result[0]?.snippet).toHaveLength(280);
  });

  it("returns [] for malformed input (missing url or domain)", () => {
    const result = normalizeCitations([
      { url: "", domain: "a.com", position: 1 } as never,
      { url: "https://a.com", domain: "", position: 2 } as never,
    ]);
    expect(result).toEqual([]);
  });

  it("returns [] when input is undefined", () => {
    expect(normalizeCitations(undefined)).toEqual([]);
  });

  it("falls back to insertion order when position is not a finite number", () => {
    const result = normalizeCitations([
      { url: "https://a.com", domain: "a.com", position: "1" as never },
      { url: "https://b.com", domain: "b.com", position: undefined as never },
      { url: "https://c.com", domain: "c.com", position: NaN as never },
      { url: "https://d.com", domain: "d.com", position: 1.9 },
    ]);
    expect(result.map((r) => r.position)).toEqual([1, 2, 3, 1]);
  });
});
