import { createHmac } from "crypto";
import { gt, eq, asc } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import {
  agentWebhooks,
  activityEvents,
  agentProfiles,
  memberProfiles,
} from "@/server/db/schema";
import { validateWebhookUrl } from "./validate-webhook-url";

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
const SKIP_AFTER_RETRIES = 3;

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
    try {
      result.webhooksProcessed++;

      // SSRF protection: skip webhooks with private/internal URLs
      const urlCheck = await validateWebhookUrl(webhook.url);
      if (!urlCheck.ok) {
        console.warn(
          `[webhook-dispatch] Skipping webhook ${webhook.id}: ${urlCheck.reason}`,
        );
        // Auto-disable the unsafe webhook
        await db
          .update(agentWebhooks)
          .set({ isEnabled: false })
          .where(eq(agentWebhooks.id, webhook.id));
        result.disabled++;
        continue;
      }

      const prefixes = webhook.categories.flatMap(
        (cat) => CATEGORY_PREFIXES[cat] ?? [],
      );
      if (prefixes.length === 0) continue;

      // Query events newer than cursor
      const events = webhook.cursor
        ? await db
            .select()
            .from(activityEvents)
            .where(gt(activityEvents.createdAt, webhook.cursor))
            .orderBy(asc(activityEvents.createdAt))
            .limit(MAX_EVENTS_PER_RUN)
        : await db
            .select()
            .from(activityEvents)
            .orderBy(asc(activityEvents.createdAt))
            .limit(MAX_EVENTS_PER_RUN);

      // Filter: match category prefixes + exclude agent's own actions + dampen agent chains
      let consecutiveAgentEvents = webhook.consecutiveAgentEvents;

      const matchingEvents = events.filter((evt) => {
        // Skip private events not meant for this webhook's owner
        if (evt.recipientId && evt.recipientId !== webhook.ownerId)
          return false;
        if (evt.actorId === webhook.agentId) return false;
        if (!prefixes.some((prefix) => evt.action.startsWith(prefix)))
          return false;

        // Dampen cross-agent ping-pong: skip agent events after 2 consecutive agent-only events
        if (evt.actorType === "agent" && consecutiveAgentEvents >= 2) {
          return false;
        }

        return true;
      });

      let consecutiveFailures = webhook.consecutiveFailures;

      for (const evt of matchingEvents) {
        const actorName = await resolveActorName(
          db,
          evt.actorId,
          evt.actorType,
        );

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
            // Track consecutive agent events for dampening
            if (evt.actorType === "agent") {
              consecutiveAgentEvents++;
            } else {
              consecutiveAgentEvents = 0; // Reset on human event
            }
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
            .set({
              isEnabled: false,
              consecutiveFailures,
              consecutiveAgentEvents,
            })
            .where(eq(agentWebhooks.id, webhook.id));
          result.disabled++;
          break;
        }

        // Skip this poison event after too many retries
        if (
          consecutiveFailures >= SKIP_AFTER_RETRIES &&
          consecutiveFailures < MAX_FAILURES
        ) {
          // Skip — advance cursor past this event, reset for next event
          consecutiveFailures = 0;
        }
      }

      // Advance cursor to last event we saw (even if no matches, so we don't re-scan)
      if (consecutiveFailures < MAX_FAILURES) {
        const finalCursor =
          events.length > 0
            ? events[events.length - 1]!.createdAt
            : webhook.cursor;

        await db
          .update(agentWebhooks)
          .set({
            cursor: finalCursor,
            consecutiveFailures,
            consecutiveAgentEvents,
          })
          .where(eq(agentWebhooks.id, webhook.id));
      }
    } catch (err) {
      console.error(
        `[webhook-dispatch] Error processing webhook ${webhook.id}:`,
        err,
      );
      result.failures++;
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
