import type { AwesomePublicCard } from "./awesome-ai-oss";
import { displayAwesomeSources } from "./awesome-ai-oss-sources";
import { visibleAwesomeStarLine } from "./awesome-ai-oss-stars";

export function awesomeDirectoryJsonLd(
  cards: readonly AwesomePublicCard[],
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    "@type": "ItemList",
    itemListElement: cards.map((card, index) => {
      const item: Record<string, unknown> = {
        "@type": "SoftwareSourceCode",
        name: card.name,
        codeRepository: card.repoUrl,
        url: card.repoUrl,
      };
      const starLine = visibleAwesomeStarLine(card, now);
      if (
        starLine &&
        typeof card.starCount === "number" &&
        card.starCount > 0
      ) {
        item.interactionStatistic = {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/LikeAction",
          userInteractionCount: card.starCount,
        };
      }
      const sources = displayAwesomeSources(card.sources);
      if (sources.length > 0) {
        item.sameAs = sources.map((source) => source.href);
      }
      return {
        "@type": "ListItem",
        position: index + 1,
        item,
      };
    }),
  };
}
