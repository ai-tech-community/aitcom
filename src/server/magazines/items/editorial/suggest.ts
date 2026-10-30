import { and, count, eq, gte, lte } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { communityMemberships } from "@/server/db/schema";

import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";

/** A public-safe welcome: only the count of active people who joined. */
export const welcomeSuggester: ItemSuggestionSource<InputOf<"editorial">> = {
  async suggest(ctx, window, config) {
    if (config.limit <= 0) return [];
    const [row] = await ctx.deps.db
      .select({ total: count() })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.status, "active"),
          gte(communityMemberships.joinedAt, window.since),
          lte(communityMemberships.joinedAt, window.until),
        ),
      );
    const total = Number(row?.total ?? 0);
    if (total === 0) return [];
    const t = await getTranslations({
      locale: routing.defaultLocale,
      namespace: "magazineEditor.autoDraft.welcome",
    });
    const heading = t("heading");
    const body = t("body", {
      count: total,
      community: ctx.community.name,
      date: new Intl.DateTimeFormat("en-GB", {
        dateStyle: "long",
        timeZone: "Europe/Amsterdam",
      }).format(window.since),
    });
    return [
      {
        input: { kind: "editorial", heading, body: plainTextToLexical(body) },
        title: heading,
        facts: [],
        openHref: null,
        reason: { type: "newMembers", count: total },
      },
    ];
  },
};
