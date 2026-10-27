import type { Where } from "payload";

import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemPickerSource } from "../types";
import { communityProjectWhere } from "./scope";

export const launchpadProjectPicker: ItemPickerSource<
  InputOf<"launchpadProject">
> = {
  async search(query, ctx, exclude) {
    const excludedIds = excludedNumericReferenceIds(
      "launchpadProject",
      exclude,
    );
    const scope = await communityProjectWhere(
      ctx.deps,
      ctx.community,
      query,
      excludedIds,
      PICKER_LIMIT,
    );
    const and: Where[] = [
      { status: { equals: "published" } },
      scope,
      ...(query ? [{ title: { like: query } }] : []),
      ...(excludedIds.length ? [{ id: { not_in: excludedIds } }] : []),
    ];
    const { docs } = await ctx.deps.payload.find({
      collection: "launchpad-projects",
      where: { and },
      sort: "-voteCount",
      depth: 0,
      locale: ctx.locale,
      limit: PICKER_LIMIT,
    });
    return docs.map((project) => {
      const facts: CandidateFact[] = [
        {
          type: "count",
          what: "upvotes",
          value: Number(project.voteCount ?? 0),
        },
      ];
      if (project.authorName)
        facts.push({ type: "byline", name: project.authorName });
      return {
        input: { kind: "launchpadProject", projectId: Number(project.id) },
        title: project.title,
        facts,
        openHref: null,
      };
    });
  },
};
