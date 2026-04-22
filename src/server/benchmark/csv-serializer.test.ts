import { describe, expect, it } from "vitest";
import { serializeBrandStatsCsv } from "./csv-serializer";

describe("serializeBrandStatsCsv", () => {
  it("emits header row + one row per model", () => {
    const csv = serializeBrandStatsCsv({
      perModel: [
        {
          modelId: "gpt-5",
          mentionsCount: 12,
          runsTotal: 34,
          visibilityPct: 35.29,
          avgRank: 2.4,
          sentimentPosPct: 80,
          sentimentNeuPct: 15,
          sentimentNegPct: 5,
        },
      ],
      topDomainsByModel: { "gpt-5": "reddit.com" },
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "model_id,mentions_count,runs_total,visibility_pct,avg_rank,sentiment_pos_pct,sentiment_neu_pct,sentiment_neg_pct,top_citation_domain",
    );
    expect(lines[1]).toBe("gpt-5,12,34,35.29,2.40,80,15,5,reddit.com");
  });

  it("quotes domain containing a comma", () => {
    const csv = serializeBrandStatsCsv({
      perModel: [
        {
          modelId: "m",
          mentionsCount: 1,
          runsTotal: 1,
          visibilityPct: 100,
          avgRank: null,
          sentimentPosPct: 0,
          sentimentNeuPct: 0,
          sentimentNegPct: 0,
        },
      ],
      topDomainsByModel: { m: "a,b.com" },
    });
    expect(csv.split("\n")[1]).toBe(`m,1,1,100.00,,0,0,0,"a,b.com"`);
  });

  it("emits empty cell for null avg_rank", () => {
    const csv = serializeBrandStatsCsv({
      perModel: [
        {
          modelId: "m",
          mentionsCount: 1,
          runsTotal: 1,
          visibilityPct: 50,
          avgRank: null,
          sentimentPosPct: 0,
          sentimentNeuPct: 0,
          sentimentNegPct: 0,
        },
      ],
      topDomainsByModel: {},
    });
    expect(csv.split("\n")[1]).toBe("m,1,1,50.00,,0,0,0,");
  });

  it("returns header-only when perModel is empty", () => {
    const csv = serializeBrandStatsCsv({ perModel: [], topDomainsByModel: {} });
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});
