/**
 * Applies the event delivery policy (./event-delivery-policy) to real rows.
 *
 * One instance serves one delivery run: it resolves each event's community
 * and acting agent's owner in batch (one query per kind, never per row) and
 * computes each owner's hidden communities once, then answers "may the agent
 * of this owner receive this event?".
 */

import { inArray } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { agentProfiles, communities } from "@/server/db/schema";
import { hiddenContentCommunityIds } from "@/server/communities/content-visibility-queries";
import { getPayloadClient } from "@/server/payload";

import type { ActivityEvent } from "./deliver-event";
import {
  type EventFacts,
  audienceAdmits,
  deliveryRuleFor,
} from "./event-delivery-policy";

type DB = typeof _db;

/** Event statuses whose event is listed to the community. */
const LISTED_EVENT_STATUSES = new Set(["published", "cancelled", "completed"]);

/** An `events` doc's community, as far as delivery is concerned. */
export interface EventTarget {
  communityId: string | null;
  status: string | null;
}

/** Loads `events` docs by id. Docs that do not exist are absent. */
export type LoadEventTargets = (
  ids: readonly number[],
) => Promise<Map<number, EventTarget>>;

export const loadEventTargetsFromPayload: LoadEventTargets = async (ids) => {
  const out = new Map<number, EventTarget>();
  if (ids.length === 0) return out;
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { id: { in: [...ids] } },
    draft: false,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  for (const doc of docs) {
    out.set(Number(doc.id), {
      communityId: doc.communityId ?? null,
      status: doc.status ?? null,
    });
  }
  return out;
};

function eventTargetId(event: ActivityEvent): number | null {
  if (!event.targetId || !/^\d+$/.test(event.targetId)) return null;
  return Number(event.targetId);
}

export class EventDeliveryAudience {
  private readonly facts = new Map<string, EventFacts>();
  private readonly hidden = new Map<string, Promise<ReadonlySet<string>>>();

  constructor(
    private readonly db: DB,
    private readonly loadEventTargets: LoadEventTargets = loadEventTargetsFromPayload,
  ) {}

  /** The events the agent of `ownerId` may receive, in their given order. */
  async admitted<E extends ActivityEvent>(
    events: readonly E[],
    ownerId: string,
  ): Promise<E[]> {
    await this.resolve(events);
    const hidden = await this.hiddenFor(ownerId);
    return events.filter((event) => {
      const facts = this.facts.get(event.id);
      return !!facts && audienceAdmits(event, facts, ownerId, hidden);
    });
  }

  async admits(event: ActivityEvent, ownerId: string): Promise<boolean> {
    return (await this.admitted([event], ownerId)).length === 1;
  }

  private hiddenFor(ownerId: string): Promise<ReadonlySet<string>> {
    let hidden = this.hidden.get(ownerId);
    if (!hidden) {
      hidden = hiddenContentCommunityIds(this.db, ownerId).then(
        (ids) => new Set(ids),
      );
      this.hidden.set(ownerId, hidden);
    }
    return hidden;
  }

  /** Resolve facts for every deliverable event not seen yet, in batch. */
  private async resolve(events: readonly ActivityEvent[]): Promise<void> {
    const pending = events.filter(
      (e) => !this.facts.has(e.id) && deliveryRuleFor(e.action) !== null,
    );
    if (pending.length === 0) return;

    const targetIds = new Set<number>();
    const agentActorIds = new Set<string>();
    for (const event of pending) {
      const audience = deliveryRuleFor(event.action)!.audience;
      if (
        audience.kind === "community-readers" &&
        audience.community.from === "event-target"
      ) {
        const id = eventTargetId(event);
        if (id !== null) targetIds.add(id);
      }
      if (audience.kind === "actor" && event.actorType === "agent") {
        agentActorIds.add(event.actorId);
      }
    }

    const [targets, agentOwners] = await Promise.all([
      this.loadEventTargets([...targetIds]),
      this.agentOwners([...agentActorIds]),
    ]);

    // The community each event claims, before checking that it exists.
    const claimed = new Map<string, string | null | undefined>();
    for (const event of pending) {
      const audience = deliveryRuleFor(event.action)!.audience;
      if (audience.kind !== "community-readers") continue;
      switch (audience.community.from) {
        case "column":
          claimed.set(event.id, event.communityId ?? null);
          break;
        case "platform-wide":
          claimed.set(event.id, null);
          break;
        case "event-target": {
          const id = eventTargetId(event);
          const target = id === null ? undefined : targets.get(id);
          claimed.set(
            event.id,
            target?.status && LISTED_EVENT_STATUSES.has(target.status)
              ? target.communityId
              : undefined,
          );
          break;
        }
      }
    }

    const existing = await this.existingCommunityIds(
      [...claimed.values()].filter((id): id is string => !!id),
    );

    for (const event of pending) {
      const claim = claimed.get(event.id);
      this.facts.set(event.id, {
        communityId:
          typeof claim === "string" && !existing.has(claim) ? undefined : claim,
        actorOwnerId: agentOwners.get(event.actorId) ?? null,
      });
    }
  }

  private async existingCommunityIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: communities.id })
      .from(communities)
      .where(inArray(communities.id, [...new Set(ids)]));
    return new Set(rows.map((r) => r.id));
  }

  private async agentOwners(agentIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (agentIds.length === 0) return out;
    const rows = await this.db
      .select({ id: agentProfiles.id, ownerId: agentProfiles.ownerId })
      .from(agentProfiles)
      .where(inArray(agentProfiles.id, agentIds));
    for (const row of rows) {
      if (row.ownerId) out.set(row.id, row.ownerId);
    }
    return out;
  }
}
