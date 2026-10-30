import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import nl from "../../messages/nl.json";

const catalogues = { en, fr, nl } as const;

describe("vote and view plurals", () => {
  // French cardinal rules use the "one" category for both 0 and 1.
  it.each([
    ["en", "1 vote", "2 votes", "0 votes", "1 view", "2 views", "0 views"],
    ["fr", "1 vote", "2 votes", "0 vote", "1 vue", "2 vues", "0 vue"],
    [
      "nl",
      "1 stem",
      "2 stemmen",
      "0 stemmen",
      "1 weergave",
      "2 weergaven",
      "0 weergaven",
    ],
  ] as const)(
    "uses singular for one %s vote and view",
    (locale, oneVote, manyVotes, zeroVotes, oneView, manyViews, zeroViews) => {
      const messages = catalogues[locale];
      const votes = createTranslator({
        locale,
        messages,
        namespace: "communities.profile",
      });
      const views = createTranslator({
        locale,
        messages,
        namespace: "forum",
      });
      expect(votes("votes", { count: 1 })).toBe(oneVote);
      expect(votes("votes", { count: 2 })).toBe(manyVotes);
      expect(votes("votes", { count: 0 })).toBe(zeroVotes);
      expect(views("views", { count: 1 })).toBe(oneView);
      expect(views("views", { count: 2 })).toBe(manyViews);
      expect(views("views", { count: 0 })).toBe(zeroViews);
    },
  );

  it("pluralizes who was active and how many discussions are new", () => {
    const frT = createTranslator({
      locale: "fr",
      messages: fr,
      namespace: "communities.profile",
    });
    const enT = createTranslator({
      locale: "en",
      messages: en,
      namespace: "communities.profile",
    });
    expect(enT("activeThisWeek", { count: 1 })).toBe("person active this week");
    expect(enT("activeThisWeek", { count: 2 })).toBe("people active this week");
    expect(enT("newDiscussions", { count: 1 })).toBe("new discussion");
    expect(frT("activeThisWeek", { count: 1 })).toBe(
      "personne active cette semaine",
    );
    expect(frT("activeThisWeek", { count: 2 })).toBe(
      "personnes actives cette semaine",
    );
    expect(frT("newDiscussions", { count: 1 })).toBe("nouvelle discussion");
    expect(frT("newDiscussions", { count: 7 })).toBe("nouvelles discussions");
  });
});
