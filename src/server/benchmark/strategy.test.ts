import { describe, expect, it } from "vitest";
import { buildStrategyInsights, parseStrategyResponse } from "./strategy";

describe("parseStrategyResponse", () => {
  it("parses grounded recommendations with evidence fields", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [
          {
            title: "Publish comparison pages for small-team CRM prompts",
            priority: "high",
            why: "Competitors appear in prompts where this brand has no visibility.",
            evidence: [
              "HubSpot appears in 4 weak prompts",
              "Salesforce appears in 3 weak prompts",
            ],
            suggestedAction:
              "Create comparison and use-case pages matching those prompts.",
            relatedPrompts: ["Best CRM for small teams?"],
            relatedCompetitors: ["HubSpot", "Salesforce"],
            relatedSources: ["g2.com", "zapier.com"],
            expectedMetricImpact:
              "Improve visibility and average position on comparison prompts.",
          },
        ],
      }),
    );

    expect(r[0]).toMatchObject({
      title: "Publish comparison pages for small-team CRM prompts",
      priority: "high",
      why: "Competitors appear in prompts where this brand has no visibility.",
      suggestedAction:
        "Create comparison and use-case pages matching those prompts.",
      relatedPrompts: ["Best CRM for small teams?"],
      relatedCompetitors: ["HubSpot", "Salesforce"],
      relatedSources: ["g2.com", "zapier.com"],
      expectedMetricImpact:
        "Improve visibility and average position on comparison prompts.",
    });
    expect(r[0]?.evidence).toHaveLength(2);
  });

  it("parses legacy rationale and severity fields", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [
          {
            title: "Invest in Reddit content",
            rationale: "40% of citations come from reddit.com",
            severity: "high",
          },
          {
            title: "Improve Perplexity visibility",
            rationale: "12% vs 34% on ChatGPT",
            severity: "medium",
          },
        ],
      }),
    );
    expect(r).toHaveLength(2);
    expect(r[0]?.title).toBe("Invest in Reddit content");
    expect(r[0]?.priority).toBe("high");
    expect(r[0]?.why).toBe("40% of citations come from reddit.com");
  });

  it("defaults missing priority to 'medium'", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [{ title: "t", rationale: "r" }],
      }),
    );
    expect(r[0]?.priority).toBe("medium");
  });

  it("coerces bogus priority to 'medium'", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [{ title: "t", rationale: "r", priority: "nuclear" }],
      }),
    );
    expect(r[0]?.priority).toBe("medium");
  });

  it("skips rows missing title or rationale", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [
          { title: "ok", rationale: "ok" },
          { title: "" },
          { rationale: "no title" },
        ],
      }),
    );
    expect(r).toHaveLength(1);
  });

  it("clamps to 8 recommendations max", () => {
    const recs = Array.from({ length: 20 }, (_, i) => ({
      title: `t${i}`,
      rationale: `r${i}`,
    }));
    const r = parseStrategyResponse(JSON.stringify({ recommendations: recs }));
    expect(r).toHaveLength(8);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseStrategyResponse("not json")).toEqual([]);
  });

  it("returns [] when recommendations is not an array", () => {
    expect(
      parseStrategyResponse(JSON.stringify({ recommendations: "no" })),
    ).toEqual([]);
  });
});

describe("buildStrategyInsights", () => {
  it("builds grounded insight candidates from benchmark evidence", () => {
    const insights = buildStrategyInsights({
      brandName: "Acme",
      hero: { visibilityPct: 12, totalMentions: 3, totalRuns: 25 },
      perModel: [
        { modelId: "openai/gpt-5", visibilityPct: 15, sentimentPosPct: 35 },
      ],
      competitors: [
        { canonical_name: "HubSpot", visibility_pct: 28 },
        { canonical_name: "Quiet CRM", visibility_pct: 18 },
      ],
      citations: [
        { domain: "g2.com", count: 3 },
        { domain: "single.example", count: 1 },
      ],
      topPrompts: [
        { text: "Best CRM for small teams?", mentions: 2 },
        { text: "Best CRM for enterprises?", mentions: 0 },
      ],
    });

    expect(insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "low_visibility", severity: "high" }),
        expect.objectContaining({
          type: "competitor_gap",
          competitor: "HubSpot",
        }),
        expect.objectContaining({ type: "source_gap", domain: "g2.com" }),
        expect.objectContaining({
          type: "prompt_opportunity",
          prompt: "Best CRM for small teams?",
        }),
        expect.objectContaining({
          type: "sentiment_gap",
          modelId: "openai/gpt-5",
        }),
      ]),
    );
  });
});
