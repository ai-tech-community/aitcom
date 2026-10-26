import type { Where } from "payload";

import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";

import type { InputOf } from "../registry";
import type { ItemPickerSource } from "../types";
import { communityProjectFilter } from "./kind";

export const launchpadProjectPicker: ItemPickerSource<
  InputOf<"launchpadProject">
> = {
  async search(query, ctx) {
    const and: Where[] = [
      { status: { equals: "published" } },
      {
        or: [
          { communityId: { equals: ctx.community.id } },
          { communityId: { exists: false } },
        ],
      },
      ...(query ? [{ title: { like: query } }] : []),
    ];
    const { docs } = await ctx.deps.payload.find({
      collection: "launchpad-projects",
      where: { and },
      sort: "-voteCount",
      depth: 0,
      locale: ctx.locale,
      limit: 50,
    });
    const inScope = await communityProjectFilter(ctx.deps, ctx.community, docs);
    return docs
      .filter(inScope)
      .slice(0, PICKER_LIMIT)
      .map((project) => {
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
