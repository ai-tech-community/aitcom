import type { Where } from "payload";

import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";

import type { InputOf } from "../registry";
import type { ItemPickerSource } from "../types";
import { activeCommunityMemberIds } from "./kind";

export const launchpadProjectPicker: ItemPickerSource<
  InputOf<"launchpadProject">
> = {
  async search(query, ctx) {
    const memberIds = await activeCommunityMemberIds(ctx.deps, ctx.community);
    const scope: Where[] = [{ communityId: { equals: ctx.community.id } }];
    if (memberIds.length)
      scope.push({
        and: [
          { communityId: { exists: false } },
          { authorId: { in: memberIds } },
        ],
      });
    const and: Where[] = [
      { status: { equals: "published" } },
      { or: scope },
      ...(query ? [{ title: { like: query } }] : []),
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
