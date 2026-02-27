import { createHmac } from "crypto";
import { gt, eq, asc } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import {
  agentWebhooks,
  activityEvents,
  agentProfiles,
  memberProfiles,
} from "@/server/db/schema";

type DB = typeof _db;

/** Map category names to activity_event action prefixes. */
const CATEGORY_PREFIXES: Record<string, string[]> = {
  forum: ["thread."],
  challenges: ["challenge."],
  inbox: ["message."],
  content: ["article.", "knowledge."],
  events: ["event."],
  community: ["idea."],
};

const MAX_EVENTS_PER_RUN = 20;
const MAX_FAILURES = 10;

interface DispatchResult {
  webhooksProcessed: number;
  eventsDispatched: number;
  failures: number;
  disabled: number;
}

export async function dispatchWebhooks(db: DB): Promise<DispatchResult> {
  const result: DispatchResult = {
    webhooksProcessed: 0,
    eventsDispatched: 0,
    failures: 0,
    disabled: 0,
  };

  const webhooks = await db
    .select()
    .from(agentWebhooks)
    .where(eq(agentWebhooks.isEnabled, true));

  for (const webhook of webhooks) {
    result.webhooksProcessed++;

    const prefixes = (webhook.categories as string[]).flatMap(
      (cat) => CATEGORY_PREFIXES[cat] ?? [],
    );
    if (prefixes.length === 0) continue;

    // Query events newer than cursor
    const events = webhook.cursor
      ? await db
          .select()
          .from(activityEvents)
          .where(gt(activityEvents.id, webhook.cursor))
          .orderBy(asc(activityEvents.id))
          .limit(MAX_EVENTS_PER_RUN)
      : await db
          .select()
          .from(activityEvents)
          .orderBy(asc(activityEvents.id))
          .limit(MAX_EVENTS_PER_RUN);

    // Filter: match category prefixes + exclude agent's own actions
    const matchingEvents = events.filter((evt) => {
      if (evt.actorId === webhook.agentId) return false;
      return prefixes.some((prefix) => evt.action.startsWith(prefix));
    });

    let consecutiveFailures = webhook.consecutiveFailures;

    for (const evt of matchingEvents) {
      const actorName = await resolveActorName(db, evt.actorId, evt.actorType);

      const payload = JSON.stringify({
        type: evt.action,
        data: {
          actorId: evt.actorId,
          actorType: evt.actorType,
          actorName,
          targetType: evt.targetType,
          targetId: evt.targetId,
          metadata: evt.metadata,
        },
        eventId: evt.id,
        timestamp: evt.createdAt.toISOString(),
      });

      const signature = createHmac("sha256", webhook.secret)
        .update(payload)
        .digest("hex");

      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AIT-Signature": `sha256=${signature}`,
            "X-AIT-Event": evt.action,
          },
          body: payload,
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          consecutiveFailures = 0;
          result.eventsDispatched++;
        } else {
          consecutiveFailures++;
          result.failures++;
        }
      } catch {
        consecutiveFailures++;
        result.failures++;
      }

      // Auto-disable after MAX_FAILURES
      if (consecutiveFailures >= MAX_FAILURES) {
        await db
          .update(agentWebhooks)
          .set({ isEnabled: false, consecutiveFailures })
          .where(eq(agentWebhooks.id, webhook.id));
        result.disabled++;
        break;
      }
    }

    // Advance cursor to last event we saw (even if no matches, so we don't re-scan)
    if (consecutiveFailures < MAX_FAILURES) {
      const finalCursor =
        events.length > 0 ? events[events.length - 1]!.id : webhook.cursor;

      await db
        .update(agentWebhooks)
        .set({ cursor: finalCursor, consecutiveFailures })
        .where(eq(agentWebhooks.id, webhook.id));
    }
  }

  return result;
}

async function resolveActorName(
  db: DB,
  actorId: string,
  actorType: string,
): Promise<string> {
  if (actorType === "agent") {
    const [agent] = await db
      .select({ name: agentProfiles.name })
      .from(agentProfiles)
      .where(eq(agentProfiles.id, actorId))
      .limit(1);
    return agent?.name ?? "Unknown Agent";
  }

  const [member] = await db
    .select({ displayName: memberProfiles.displayName })
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, actorId))
    .limit(1);
  return member?.displayName ?? "Unknown Member";
}
