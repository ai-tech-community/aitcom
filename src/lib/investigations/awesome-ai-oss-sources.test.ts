import { describe, expect, it } from "vitest";

import { AWESOME_AI_OSS_SEEDS, curatedPublicCards } from "./awesome-ai-oss";
import {
  AWESOME_AI_OSS_CURATED_SOURCES,
  AWESOME_SOURCE_KINDS,
  AWESOME_SOURCE_LABELS,
  sanitizeAwesomeSources,
} from "./awesome-ai-oss-sources";

describe("sanitizeAwesomeSources", () => {
  it("keeps 2–4 verified absolute URLs and drops the rest", () => {
    expect(
      sanitizeAwesomeSources([
        { kind: "docs", href: "https://docs.vllm.ai" },
        { kind: "deep-dive", href: "https://docs.vllm.ai/en/latest/" },
        { kind: "talk", href: "https://example.com/talk" },
        { kind: "demo", href: "/relative" },
        { kind: "docs", href: "javascript:alert(1)" },
        { kind: "demo", href: "https://example.com/demo" },
        { kind: "talk", href: "https://example.com/overflow" },
      ]),
    ).toEqual([
      { kind: "docs", href: "https://docs.vllm.ai" },
      { kind: "deep-dive", href: "https://docs.vllm.ai/en/latest/" },
      { kind: "talk", href: "https://example.com/talk" },
      { kind: "demo", href: "https://example.com/demo" },
    ]);
  });

  it("hides the section when nothing verified remains", () => {
    expect(sanitizeAwesomeSources([])).toEqual([]);
    expect(
      sanitizeAwesomeSources([{ kind: "docs", href: "javascript:alert(1)" }]),
    ).toEqual([]);
    expect(
      sanitizeAwesomeSources([
        { kind: "wiki" as "docs", href: "https://x.com" },
      ]),
    ).toEqual([]);
  });

  it("locks Writing Bot labels", () => {
    expect(AWESOME_SOURCE_KINDS).toEqual(["docs", "deep-dive", "talk", "demo"]);
    expect(AWESOME_SOURCE_LABELS).toEqual({
      docs: "Docs",
      "deep-dive": "Deep dive",
      talk: "Talk",
      demo: "Demo",
    });
  });
});

describe("curated sources seed", () => {
  it("only attaches verified absolute URLs and never invents stars", () => {
    const ids = new Set(AWESOME_AI_OSS_SEEDS.map((seed) => seed.id));
    expect(Object.keys(AWESOME_AI_OSS_CURATED_SOURCES).length).toBeGreaterThan(
      0,
    );

    for (const [id, sources] of Object.entries(
      AWESOME_AI_OSS_CURATED_SOURCES,
    )) {
      expect(ids.has(id)).toBe(true);
      const clean = sanitizeAwesomeSources(sources);
      expect(clean.length).toBeGreaterThanOrEqual(2);
      expect(clean.length).toBeLessThanOrEqual(4);
      expect(clean).toEqual(sources);
    }

    for (const card of curatedPublicCards()) {
      expect(card.starCount).toBeNull();
      expect(card.starsCheckedAt).toBeNull();
      expect(card.sources).toEqual(
        sanitizeAwesomeSources(AWESOME_AI_OSS_CURATED_SOURCES[card.id] ?? []),
      );
    }
  });
});
