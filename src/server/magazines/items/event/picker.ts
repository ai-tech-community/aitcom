import type { Where } from "payload";

import { PUBLICLY_LISTED_EVENT_STATUSES } from "@/lib/events/event-status";
import { PICKER_LIMIT, type CandidateFact } from "@/lib/magazines/picker";
import type { Event } from "@/payload-types";
import { communityContentWhere } from "@/server/communities/forum-scope";

import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemPickerSource, PickerSourceCandidate } from "../types";

export function eventCandidate(
  event: Event,
): PickerSourceCandidate<InputOf<"event">> {
  const facts: CandidateFact[] = [
    { type: "date", label: "starts", at: event.date },
  ];
  if (event.status === "cancelled" || event.status === "completed")
    facts.push({ type: "eventStatus", status: event.status });
  return {
    input: { kind: "event", eventId: Number(event.id) },
    title: event.title,
    facts,
    openHref: null,
  };
}

export const eventPicker: ItemPickerSource<InputOf<"event">> = {
  async search(query, ctx, exclude) {
    const excludedIds = excludedNumericReferenceIds("event", exclude);
    const and: Where[] = [
      ...(excludedIds.length ? [{ id: { not_in: excludedIds } }] : []),
      { status: { in: [...PUBLICLY_LISTED_EVENT_STATUSES] } },
      communityContentWhere(ctx.community),
      ...(query ? [{ title: { like: query } }] : []),
    ];
    const { docs } = await ctx.deps.payload.find({
      collection: "events",
      where: { and },
      sort: "-date",
      draft: false,
      depth: 0,
      locale: ctx.locale,
      limit: PICKER_LIMIT,
    });
    return docs.map(eventCandidate);
  },
};
