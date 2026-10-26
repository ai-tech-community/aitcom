import { z } from "zod";

import { isPubliclyListedEventStatus } from "@/lib/events/event-status";
import type { UnavailableItem } from "@/lib/magazines/item-views";
import { itemReference } from "@/lib/magazines/references";
import { communityContentMatches } from "@/server/communities/forum-scope";

import { introInput, itemBaseInput, storedIntro } from "../base-input";
import { loadCommunityContentRule } from "../community-content";
import { itemIdOf } from "../item-id";
import { validateReferences } from "../references";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";

const eventInput = z.object({
  kind: z.literal("event"),
  ...itemBaseInput,
  eventId: z.number().int().positive(),
});
type EventInput = z.infer<typeof eventInput>;
type EventStored = StoredItem<"event">;

async function loadEvents(items: EventStored[], ctx: ItemContext) {
  const { docs } = await ctx.payload.find({
    collection: "events",
    where: { id: { in: items.map((item) => Number(item.eventId)) } },
    draft: false,
    depth: 0,
    locale: ctx.locale,
    pagination: false,
  });
  return new Map(docs.map((event) => [Number(event.id), event]));
}

const referenceOf = (stored: EventStored) =>
  itemReference("event", Number(stored.eventId));

export const eventItemKind: IssueItemKind<"event", EventInput, EventStored> = {
  kind: "event",
  input: eventInput,
  toStored: (input) => ({
    intro: storedIntro(input.intro),
    eventId: input.eventId,
  }),
  toInput: (stored) => ({
    kind: "event",
    ...(stored.id ? { id: stored.id } : {}),
    eventId: Number(stored.eventId),
    ...introInput(stored.intro),
  }),
  referenceOf,
  async validate(items, ctx) {
    const [events, rule] = await Promise.all([
      loadEvents(
        items.map((item) => item.stored),
        ctx,
      ),
      loadCommunityContentRule(ctx.reader, ctx.access),
    ]);
    return validateReferences(items, {
      referenceOf,
      acceptNew: (stored) => {
        const event = events.get(Number(stored.eventId));
        return (
          !!event &&
          isPubliclyListedEventStatus(event.status) &&
          communityContentMatches(event.communityId, ctx.community) &&
          rule.readable(event.communityId)
        );
      },
    });
  },
  async load(items, ctx) {
    const [events, rule] = await Promise.all([
      loadEvents(items, ctx),
      loadCommunityContentRule(ctx.reader, ctx.access),
    ]);
    const views = new Map<string, ItemViewOf<"event"> | UnavailableItem>();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      const event = events.get(Number(stored.eventId));
      const unavailable = (reason: UnavailableItem["reason"]) =>
        views.set(itemId, { kind: "event", itemId, unavailable: true, reason });
      if (!event) unavailable("missing");
      else if (!isPubliclyListedEventStatus(event.status))
        unavailable("unpublished");
      else if (!rule.readable(event.communityId)) unavailable("no_access");
      else
        views.set(itemId, {
          kind: "event",
          itemId,
          intro: stored.intro ?? null,
          membersOnly: rule.membersOnly(event.communityId),
          event: {
            slug: event.slug,
            title: event.title,
            date: event.date,
            endDate: event.endDate ?? null,
            city: event.city ?? null,
            online: event.format === "online",
            status: event.status,
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
