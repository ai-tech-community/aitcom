import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

function flattenedKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]: [string, unknown]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null
      ? flattenedKeys(child, path)
      : [path];
  });
}

describe("message catalogues", () => {
  it.each([
    [
      "en",
      en,
      "1 person joined Our community since 27 September 2026. Say hello!",
      "2 people joined Our community since 27 September 2026. Say hello!",
    ],
    [
      "nl",
      nl,
      "Sinds 27 September 2026 is 1 persoon lid geworden van Our community. Zeg even hallo!",
      "Sinds 27 September 2026 zijn 2 mensen lid geworden van Our community. Zeg even hallo!",
    ],
  ] as const)(
    "formats singular and plural welcome copy in %s",
    (locale, messages, singular, plural) => {
      const t = createTranslator({
        locale,
        messages,
        namespace: "magazineEditor.autoDraft.welcome",
      });
      const values = { community: "Our community", date: "27 September 2026" };
      expect(t("body", { ...values, count: 1 })).toBe(singular);
      expect(t("body", { ...values, count: 2 })).toBe(plural);
    },
  );

  it.each([
    [
      "en",
      en,
      "1 thing",
      "2 things",
      "1 reply",
      "2 replies",
      "1 upvote",
      "2 upvotes",
      "1 new member joined",
      "2 new members joined",
    ],
    [
      "nl",
      nl,
      "1 ding",
      "2 dingen",
      "1 reactie",
      "2 reacties",
      "1 stem",
      "2 stemmen",
      "1 nieuw lid erbij",
      "2 nieuwe leden erbij",
    ],
  ] as const)(
    "formats draft counts and reasons in %s",
    (
      locale,
      messages,
      singleThing,
      pluralThings,
      singleReply,
      pluralReplies,
      singleVote,
      pluralVotes,
      singleMember,
      pluralMembers,
    ) => {
      const t = createTranslator({
        locale,
        messages,
        namespace: "magazineEditor",
      });
      for (const key of [
        "autoDraft.makeNow.too_few",
        "autoDraft.history.skipReasons.too_few",
        "notifications.autoDraftSkipped.content.too_few",
      ] as const) {
        expect(t(key, { found: 1, needed: 3 })).toContain(singleThing);
        expect(t(key, { found: 2, needed: 3 })).toContain(pluralThings);
      }
      for (const key of [
        "notifications.autoDraftReady.content.notify",
        "notifications.autoDraftReady.content.auto",
      ] as const) {
        expect(t(key, { count: 1, date: "tomorrow" })).toContain(singleThing);
        expect(t(key, { count: 2, date: "tomorrow" })).toContain(pluralThings);
      }
      expect(
        t("autoDraft.whenReadyOptions.auto_publish", { days: 1 }),
      ).toContain(locale === "en" ? "1 day" : "1 dag");
      expect(
        t("autoDraft.whenReadyOptions.auto_publish", { days: 2 }),
      ).toContain(locale === "en" ? "2 days" : "2 dagen");
      for (const going of [1, 2]) {
        expect(
          t.rich("builder.reasons.eventRecap", {
            date: "24 October",
            going,
            number: (chunks) => chunks,
          }),
        ).toContain(
          locale === "en"
            ? `${going} going`
            : `${going} ${going === 1 ? "deelnemer" : "deelnemers"}`,
        );
      }
      for (const [key, singular, plural] of [
        ["builder.reasons.mostReplies", singleReply, pluralReplies],
        ["builder.reasons.mostUpvotes", singleVote, pluralVotes],
        ["builder.reasons.newMembers", singleMember, pluralMembers],
      ] as const) {
        expect(t.rich(key, { count: 1, number: (chunks) => chunks })).toContain(
          singular,
        );
        expect(t.rich(key, { count: 2, number: (chunks) => chunks })).toContain(
          plural,
        );
      }
    },
  );

  it("en and nl have the same keys for the magazine and badge copy", () => {
    for (const [english, dutch] of [
      [en.magazineEditor, nl.magazineEditor],
      [en.magazines, nl.magazines],
      [en.magazineMail, nl.magazineMail],
      [en.magazineSubscription, nl.magazineSubscription],
      [en.magazineUnsubscribe, nl.magazineUnsubscribe],
      [en.articleEditor.magazine, nl.articleEditor.magazine],
      [en.badges, nl.badges],
    ]) {
      expect(flattenedKeys(dutch!).sort()).toEqual(
        flattenedKeys(english!).sort(),
      );
    }
  });
});
