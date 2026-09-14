import { describe, expect, it } from "vitest";

import { curatedPublicCards } from "./awesome-ai-oss";
import { awesomeDirectoryJsonLd } from "./awesome-ai-oss-jsonld";

describe("awesomeDirectoryJsonLd", () => {
  it("emits SoftwareSourceCode and only real star interactionStatistic", () => {
    const cards = curatedPublicCards()
      .slice(0, 2)
      .map((card, index) =>
        index === 0
          ? {
              ...card,
              starCount: 12_400,
              starsCheckedAt: "2026-09-14T08:00:00.000Z",
            }
          : card,
      );

    const data = awesomeDirectoryJsonLd(
      cards,
      new Date("2026-09-14T12:00:00.000Z"),
    );
    expect(data["@type"]).toBe("ItemList");
    const items = data.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);

    const withStars = items[0]!.item as Record<string, unknown>;
    expect(withStars["@type"]).toBe("SoftwareSourceCode");
    expect(withStars.codeRepository).toBe(cards[0]!.repoUrl);
    expect(withStars.interactionStatistic).toEqual({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: 12_400,
    });

    const withoutStars = items[1]!.item as Record<string, unknown>;
    expect(withoutStars.interactionStatistic).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/aggregateRating/i);
    expect(JSON.stringify(data)).not.toMatch(/"ratingValue"/);
  });

  it("never marks Hub votes as ratings and omits stale or zero stars", () => {
    const [base] = curatedPublicCards();
    const data = awesomeDirectoryJsonLd(
      [
        {
          ...base!,
          starCount: 0,
          starsCheckedAt: "2026-09-14T08:00:00.000Z",
        },
      ],
      new Date("2026-09-14T12:00:00.000Z"),
    );
    const item = (data.itemListElement as Array<Record<string, unknown>>)[0]!
      .item as Record<string, unknown>;
    expect(item.interactionStatistic).toBeUndefined();
  });
});
