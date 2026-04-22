import { describe, expect, it } from "vitest";
import { parseStrategyResponse } from "./strategy";

describe("parseStrategyResponse", () => {
  it("parses an array of recommendations", () => {
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
    expect(r[0]?.severity).toBe("high");
  });

  it("defaults missing severity to 'medium'", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [{ title: "t", rationale: "r" }],
      }),
    );
    expect(r[0]?.severity).toBe("medium");
  });

  it("coerces bogus severity to 'medium'", () => {
    const r = parseStrategyResponse(
      JSON.stringify({
        recommendations: [{ title: "t", rationale: "r", severity: "nuclear" }],
      }),
    );
    expect(r[0]?.severity).toBe("medium");
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
