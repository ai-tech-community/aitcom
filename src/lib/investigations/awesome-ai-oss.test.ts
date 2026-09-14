import { describe, expect, it } from "vitest";
import {
  AWESOME_AI_OSS_SEEDS,
  applyAwesomeDirectoryQuery,
  curatedPublicCards,
  formatAwesomeAddedDate,
  parseAwesomeDirectoryQuery,
} from "./awesome-ai-oss";

describe("Awesome AI OSS seeds", () => {
  it("keeps the locked 15 curated repos with frozen added dates", () => {
    const cards = curatedPublicCards();
    expect(cards).toHaveLength(15);
    expect(
      cards.filter((card) => card.repoUrl.includes("github.com")),
    ).toHaveLength(12);
    expect(
      cards.filter((card) => card.repoUrl.includes("gitlab.com")),
    ).toHaveLength(3);
    expect(new Set(cards.map((card) => card.id)).size).toBe(15);
    for (const seed of AWESOME_AI_OSS_SEEDS) {
      expect(seed.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(seed.blurb.en.length).toBeGreaterThan(0);
    }
  });
});

describe("parseAwesomeDirectoryQuery", () => {
  it("defaults to newest and all categories", () => {
    expect(parseAwesomeDirectoryQuery({}, false)).toEqual({
      q: "",
      category: "all",
      sort: "newest",
    });
  });

  it("ignores voted sort unless a Hub session exists", () => {
    expect(
      parseAwesomeDirectoryQuery(
        { sort: "voted", category: "runtimes" },
        false,
      ),
    ).toEqual({
      q: "",
      category: "runtimes",
      sort: "newest",
    });
    expect(parseAwesomeDirectoryQuery({ sort: "voted" }, true).sort).toBe(
      "voted",
    );
  });
});

describe("applyAwesomeDirectoryQuery", () => {
  const cards = curatedPublicCards();

  it("filters by category and search without using vote counts", () => {
    const protocols = applyAwesomeDirectoryQuery(
      cards,
      { q: "", category: "protocols", sort: "newest" },
      "en",
    );
    expect(protocols.every((card) => card.category === "protocols")).toBe(true);
    expect(protocols.map((card) => card.name)).toContain(
      "modelcontextprotocol/servers",
    );

    const searched = applyAwesomeDirectoryQuery(
      cards,
      { q: "vllm", category: "all", sort: "newest" },
      "en",
    );
    expect(searched.map((card) => card.id)).toEqual(["curated-vllm"]);
  });

  it("sorts newest first, and most-voted only when counts are provided", () => {
    const newest = applyAwesomeDirectoryQuery(
      cards,
      { q: "", category: "all", sort: "newest" },
      "en",
    );
    expect(newest[0]!.addedOn >= newest[1]!.addedOn).toBe(true);

    const voted = applyAwesomeDirectoryQuery(
      cards,
      { q: "", category: "all", sort: "voted" },
      "en",
      { "curated-ollama": 4, "curated-vllm": 1 },
    );
    expect(voted[0]?.id).toBe("curated-ollama");
    expect(voted[1]?.id).toBe("curated-vllm");
  });
});

describe("formatAwesomeAddedDate", () => {
  it("uses Writing Bot Added: Month D, YYYY in English", () => {
    expect(formatAwesomeAddedDate("2024-11-25", "en")).toBe(
      "Added: November 25, 2024",
    );
  });
});
