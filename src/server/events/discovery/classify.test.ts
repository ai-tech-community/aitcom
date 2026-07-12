import { describe, expect, it } from "vitest";

import { classifyAudiences, type ClassifiableAudience } from "./classify";

function makeAudience(
  overrides: Partial<ClassifiableAudience> = {},
): ClassifiableAudience {
  return {
    id: 1,
    slug: "engineers",
    name: "Engineers",
    interests: ["ai", "engineering", "llms"],
    ...overrides,
  };
}

const ENGINEERS = makeAudience({
  id: 1,
  slug: "engineers",
  name: "Engineers",
  interests: ["ai", "engineering", "llms"],
});

const FOUNDERS = makeAudience({
  id: 2,
  slug: "founders",
  name: "Founders",
  interests: ["startups", "fundraising", "ai"],
});

const MARKETERS_NO_INTERESTS = makeAudience({
  id: 3,
  slug: "marketers",
  name: "Marketers",
  interests: [],
});

// Deliberately named/slugged so it does not collide via name/slug match with
// any word in the phrase-match test text below (isolates the phrase check).
const WIDGETS_WITH_PHRASE = makeAudience({
  id: 4,
  slug: "widgets",
  name: "Widgets",
  interests: ["product management"],
});

describe("classifyAudiences", () => {
  it("matches an audience whose single-word interest tag appears in the title", () => {
    const result = classifyAudiences(
      { title: "Deep dive into LLMs for backend engineers" },
      [ENGINEERS],
    );
    expect(result.audienceIds).toEqual([1]);
  });

  it("matches a multi-word interest phrase found in the joined text", () => {
    const result = classifyAudiences(
      {
        title: "Community meetup",
        description: "A talk on product management practices",
      },
      [WIDGETS_WITH_PHRASE],
    );
    expect(result.audienceIds).toEqual([4]);
  });

  it("does not match a multi-word interest phrase when its words appear apart, not adjacent", () => {
    const result = classifyAudiences(
      {
        title: "Community meetup",
        description: "A talk on the management of roadmap topics",
      },
      [WIDGETS_WITH_PHRASE],
    );
    expect(result.audienceIds).toEqual([]);
  });

  it("matches on the audience slug appearing verbatim in the title, even with empty interests", () => {
    const result = classifyAudiences({ title: "Founders Breakfast" }, [
      FOUNDERS,
    ]);
    expect(result.audienceIds).toEqual([2]);
  });

  it("matches an empty-interests audience only by its name appearing verbatim", () => {
    const result = classifyAudiences({ title: "A morning for marketers" }, [
      MARKETERS_NO_INTERESTS,
    ]);
    expect(result.audienceIds).toEqual([3]);
  });

  it("does not match an empty-interests audience when neither its name nor slug appears", () => {
    const result = classifyAudiences(
      { title: "A deep technical AI workshop" },
      [MARKETERS_NO_INTERESTS],
    );
    expect(result.audienceIds).toEqual([]);
  });

  it("returns an empty result with zero confidence when nothing matches", () => {
    const result = classifyAudiences(
      { title: "A quiet afternoon of pottery" },
      [ENGINEERS, FOUNDERS],
    );
    expect(result).toEqual({ audienceIds: [], confidence: 0 });
  });

  it("matches multiple audiences and preserves input order in audienceIds", () => {
    const result = classifyAudiences(
      { title: "AI founders and engineers night" },
      [ENGINEERS, FOUNDERS],
    );
    expect(result.audienceIds).toEqual([1, 2]);
  });

  it("is case- and punctuation-insensitive", () => {
    const result = classifyAudiences(
      { title: "A.I., ENGINEERING!! -- what's next?!" },
      [ENGINEERS],
    );
    expect(result.audienceIds).toEqual([1]);
  });

  it("does not false-positive-match a short interest tag substring inside an unrelated word", () => {
    // "ai" must not match inside "again" or "explain" via naive substring search.
    const result = classifyAudiences(
      { title: "Let's explain this again, once more" },
      [ENGINEERS],
    );
    expect(result.audienceIds).toEqual([]);
  });

  it("draws from title, description, and location together", () => {
    const result = classifyAudiences(
      {
        title: "Evening meetup",
        description: null,
        location: "Engineering Hub",
      },
      [ENGINEERS],
    );
    expect(result.audienceIds).toEqual([1]);
  });

  it("confidence is monotonically higher with more matched interest tags on the same audience", () => {
    const oneHit = classifyAudiences({ title: "AI talk" }, [ENGINEERS]);
    const twoHits = classifyAudiences({ title: "AI and engineering talk" }, [
      ENGINEERS,
    ]);
    const threeHits = classifyAudiences(
      { title: "AI, engineering, and LLMs talk" },
      [ENGINEERS],
    );
    expect(oneHit.confidence).toBeGreaterThan(0);
    expect(twoHits.confidence).toBeGreaterThan(oneHit.confidence);
    expect(threeHits.confidence).toBeGreaterThan(twoHits.confidence);
  });

  it("computes confidence as min(1, totalHits / 3) — a single interest hit yields 1/3", () => {
    const result = classifyAudiences({ title: "AI talk" }, [ENGINEERS]);
    expect(result.confidence).toBeCloseTo(1 / 3, 10);
  });

  it("caps confidence at 1 when total hits exceed 3", () => {
    const result = classifyAudiences(
      {
        title:
          "AI, engineering, and LLMs for founders and startups fundraising",
      },
      [ENGINEERS, FOUNDERS],
    );
    expect(result.confidence).toBe(1);
  });
});
