import type { LaunchpadProject } from "@/payload-types";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { launchpadProjectCandidate } from "./picker";
import { communityProjectWhere } from "./scope";

export const launchpadProjectSuggester: ItemSuggestionSource<
  InputOf<"launchpadProject">
> = {
  async suggest(ctx, window, config) {
    if (config.limit <= 0) return [];
    const exclude = excludedNumericReferenceIds(
      "launchpadProject",
      config.exclude,
    );
    let docs: LaunchpadProject[];
    for (;;) {
      const scope = await communityProjectWhere(
        ctx.deps,
        ctx.community,
        "",
        exclude,
        config.limit,
        window.since,
      );
      ({ docs } = await ctx.deps.payload.find({
        collection: "launchpad-projects",
        where: {
          and: [
            { status: { equals: "published" } },
            scope,
            ...(exclude.length ? [{ id: { not_in: exclude } }] : []),
          ],
        },
        sort: ["-voteCount", "id"],
        depth: 0,
        locale: ctx.locale,
        limit: config.limit,
      }));
      // Rows updated after the fixed window can occupy the member SQL's
      // bounded set too. Remove them and refill before accepting the order.
      const newer = docs.filter(
        (project) =>
          new Date(project.updatedAt).getTime() > window.until.getTime(),
      );
      if (newer.length === 0) break;
      exclude.push(...newer.map((project) => Number(project.id)));
    }
    return docs.map((project) => ({
      ...launchpadProjectCandidate(project),
      reason: { type: "mostUpvotes", count: Number(project.voteCount ?? 0) },
    }));
  },
};
