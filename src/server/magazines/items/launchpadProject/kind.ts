import { z } from "zod";

import { lexicalPlainText } from "@/lib/lexical-text";
import type { UnavailableItem } from "@/lib/magazines/item-views";
import { launchpadProjectInputReference } from "@/lib/magazines/references";

import {
  cutWords,
  introInput,
  itemBaseInput,
  storedIntro,
} from "../base-input";
import { loadCommunityContentRule } from "../community-content";
import { itemIdOf } from "../item-id";
import { validateReferences } from "../references";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";

import { communityProjectFilter } from "./scope";

const projectInput = z.object({
  kind: z.literal("launchpadProject"),
  ...itemBaseInput,
  projectId: z.number().int().positive(),
});
type ProjectInput = z.infer<typeof projectInput>;
type ProjectStored = StoredItem<"launchpadProject">;

async function loadProjects(items: ProjectStored[], ctx: ItemContext) {
  const { docs } = await ctx.payload.find({
    collection: "launchpad-projects",
    where: { id: { in: items.map((item) => Number(item.projectId)) } },
    depth: 0,
    locale: ctx.locale,
    pagination: false,
  });
  return new Map(docs.map((project) => [Number(project.id), project]));
}
const referenceOf = launchpadProjectInputReference;

export const launchpadProjectItemKind: IssueItemKind<
  "launchpadProject",
  ProjectInput,
  ProjectStored
> = {
  kind: "launchpadProject",
  input: projectInput,
  toStored: (input) => ({
    intro: storedIntro(input.intro),
    projectId: input.projectId,
  }),
  toInput: (stored) => ({
    kind: "launchpadProject",
    ...(stored.id ? { id: stored.id } : {}),
    projectId: Number(stored.projectId),
    ...introInput(stored.intro),
  }),
  referenceOf,
  async validate(items, ctx) {
    const [projects, rule] = await Promise.all([
      loadProjects(
        items.map((item) => item.stored),
        ctx,
      ),
      loadCommunityContentRule(ctx.reader, ctx.access),
    ]);
    const inScope = await communityProjectFilter(ctx, ctx.community, [
      ...projects.values(),
    ]);
    return validateReferences(items, {
      referenceOf,
      acceptNew: (stored) => {
        const project = projects.get(Number(stored.projectId));
        return (
          !!project &&
          project.status === "published" &&
          inScope(project) &&
          rule.readable(project.communityId)
        );
      },
    });
  },
  async load(items, ctx) {
    const [projects, rule] = await Promise.all([
      loadProjects(items, ctx),
      loadCommunityContentRule(ctx.reader, ctx.access),
    ]);
    const views = new Map<
      string,
      ItemViewOf<"launchpadProject"> | UnavailableItem
    >();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      const project = projects.get(Number(stored.projectId));
      const unavailable = (reason: UnavailableItem["reason"]) =>
        views.set(itemId, {
          kind: "launchpadProject",
          itemId,
          unavailable: true,
          reason,
        });
      if (!project) unavailable("missing");
      else if (project.status !== "published") unavailable("unpublished");
      else if (!rule.readable(project.communityId)) unavailable("no_access");
      else
        views.set(itemId, {
          kind: "launchpadProject",
          itemId,
          intro: stored.intro ?? null,
          membersOnly: rule.membersOnly(project.communityId),
          project: {
            slug: project.slug,
            title: project.title,
            pitch: cutWords(lexicalPlainText(project.pitch), 40),
            stage: project.stage,
            voteCount: Number(project.voteCount ?? 0),
            authorName: project.authorName ?? null,
          },
        });
    }
    return views;
  },
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "full":
      case "editor":
        return true;
    }
  },
};
