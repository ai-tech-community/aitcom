import { and, count, inArray } from "drizzle-orm";
import type { Where } from "payload";

import { EVENT_COMING_UP_DAYS } from "@/lib/magazines/auto-draft";
import type { CandidateFact } from "@/lib/magazines/picker";
import type { Event } from "@/payload-types";
import { communityContentWhere } from "@/server/communities/forum-scope";
import { eventRegistrations } from "@/server/db/schema";

import type { Deps } from "../../deps";
import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type {
  ItemCommunity,
  ItemSuggestionSource,
  SuggestionSourceCandidate,
} from "../types";

export const DRAFTABLE_EVENT_STATUSES = ["published", "completed"] as const;
const DAY = 86_400_000;

function draftableCommunityEvents(community: ItemCommunity): Where[] {
  return [
    communityContentWhere(community),
    { status: { in: [...DRAFTABLE_EVENT_STATUSES] } },
  ];
}

/**
 * Community events whose end (the UTC day after their last day) lies in
 * [since, until], oldest end first, then id. Live rows, never draft versions.
 */
export async function endedCommunityEvents(
  deps: Pick<Deps, "payload">,
  community: ItemCommunity,
  since: Date,
  until: Date,
): Promise<{ id: number; endsAt: Date }[]> {
  const lastDay = {
    greater_than_equal: new Date(since.getTime() - DAY).toISOString(),
    less_than_equal: new Date(until.getTime() - DAY).toISOString(),
  };
  const { docs } = await deps.payload.find({
    collection: "events",
    where: {
      and: [
        ...draftableCommunityEvents(community),
        {
          or: [
            { endDate: lastDay },
            { and: [{ endDate: { exists: false } }, { date: lastDay }] },
          ],
        },
      ],
    },
    select: { date: true, endDate: true },
    draft: false,
    depth: 0,
    pagination: false,
  });
  return docs
    .map((event) => ({
      id: Number(event.id),
      endsAt: new Date(new Date(event.endDate ?? event.date).getTime() + DAY),
    }))
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime() || a.id - b.id);
}

function candidate(
  event: Event,
  reason: SuggestionSourceCandidate<InputOf<"event">>["reason"],
): SuggestionSourceCandidate<InputOf<"event">> {
  const facts: CandidateFact[] = [
    { type: "date", label: "starts", at: event.date },
  ];
  if (event.status === "completed")
    facts.push({ type: "eventStatus", status: event.status });
  return {
    input: { kind: "event", eventId: Number(event.id) },
    title: event.title,
    facts,
    openHref: null,
    reason,
  };
}

export const eventSuggester: ItemSuggestionSource<InputOf<"event">> = {
  async suggest(ctx, window, config) {
    if (config.limit <= 0) return [];
    const exclude = excludedNumericReferenceIds("event", config.exclude);
    const today = new Date(ctx.now);
    today.setUTCHours(0, 0, 0, 0);
    const { docs: coming } = await ctx.deps.payload.find({
      collection: "events",
      where: {
        and: [
          ...draftableCommunityEvents(ctx.community),
          {
            date: {
              greater_than_equal: today.toISOString(),
              less_than: new Date(
                today.getTime() + EVENT_COMING_UP_DAYS * DAY,
              ).toISOString(),
            },
          },
          ...(exclude.length ? [{ id: { not_in: exclude } }] : []),
        ],
      },
      sort: ["date", "id"],
      draft: false,
      depth: 0,
      locale: ctx.locale,
      limit: config.limit,
    });
    const result = coming.map((event) =>
      candidate(event, { type: "eventComingUp", at: event.date }),
    );
    if (result.length >= config.limit) return result;

    const ended = await endedCommunityEvents(
      ctx.deps,
      ctx.community,
      window.since,
      new Date(Math.min(window.until.getTime(), ctx.now.getTime())),
    );
    const excluded = new Set([
      ...exclude,
      ...coming.map((event) => Number(event.id)),
    ]);
    const ends = new Map(
      ended
        .filter((event) => !excluded.has(event.id))
        .map((event) => [event.id, event.endsAt.getTime()]),
    );
    if (ends.size === 0) return result;
    const { docs: past } = await ctx.deps.payload.find({
      collection: "events",
      where: {
        and: [
          ...draftableCommunityEvents(ctx.community),
          { id: { in: [...ends.keys()] } },
        ],
      },
      draft: false,
      depth: 0,
      locale: ctx.locale,
      limit: ends.size,
      pagination: false,
    });
    if (past.length === 0) return result;
    const counts = await ctx.deps.db
      .select({ eventId: eventRegistrations.eventId, going: count() })
      .from(eventRegistrations)
      .where(
        and(
          inArray(
            eventRegistrations.eventId,
            past.map((event) => Number(event.id)),
          ),
          inArray(eventRegistrations.status, ["registered", "attended"]),
        ),
      )
      .groupBy(eventRegistrations.eventId);
    const going = new Map(
      counts.map((row) => [row.eventId, Number(row.going)]),
    );
    const attendance = (event: Event) => going.get(Number(event.id)) ?? 0;
    past.sort(
      (a, b) =>
        attendance(b) - attendance(a) ||
        ends.get(Number(b.id))! - ends.get(Number(a.id))! ||
        Number(a.id) - Number(b.id),
    );
    return [
      ...result,
      ...past.slice(0, config.limit - result.length).map((event) =>
        candidate(event, {
          type: "eventRecap",
          at: event.date,
          going: attendance(event),
        }),
      ),
    ];
  },
};
