import { and, gt, eq, asc } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { agentWebhooks, activityEvents } from "@/server/db/schema";
import { validateWebhookUrl } from "./validate-webhook-url";
import {
  deliverEvent,
  resolveActorName,
  webhookMatchesEvent,
} from "./deliver-event";

type DB = typeof _db;

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
    .where(
      and(
        eq(agentWebhooks.isEnabled, true),
        eq(agentWebhooks.status, "active"),
      ),
    );

  for (const webhook of webhooks) {
    try {
      result.webhooksProcessed++;

      // SSRF protection: skip (and disable) webhooks with private/internal URLs.
      const urlCheck = await validateWebhookUrl(webhook.url);
      if (!urlCheck.ok) {
        console.warn(
          `[webhook-dispatch] Skipping webhook ${webhook.id}: ${urlCheck.reason}`,
        );
        await db
          .update(agentWebhooks)
          .set({ isEnabled: false })
          .where(eq(agentWebhooks.id, webhook.id));
        result.disabled++;
        continue;
      }

      // Query events newer than cursor.
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

      let consecutiveAgentEvents = webhook.consecutiveAgentEvents;
      const matchingEvents = events.filter((evt) =>
        webhookMatchesEvent(webhook, evt, consecutiveAgentEvents),
      );

      let consecutiveFailures = webhook.consecutiveFailures;

      for (const evt of matchingEvents) {
        const actorName = await resolveActorName(
          db,
          evt.actorId,
          evt.actorType,
        );
        const t0 = Date.now();
        const outcome = await deliverEvent(webhook, evt, actorName);
        const latencyMs = Date.now() - t0;
        console.log("[webhook-delivery]", {
          path: "cron",
          webhookId: webhook.id,
          eventId: evt.id,
          ok: outcome.ok,
          latencyMs,
        });

        if (outcome.ok) {
          consecutiveFailures = 0;
          result.eventsDispatched++;
          if (evt.actorType === "agent") {
            consecutiveAgentEvents++;
          } else {
            consecutiveAgentEvents = 0;
          }
        } else {
          consecutiveFailures++;
          result.failures++;
        }

        // Auto-disable after MAX_FAILURES consecutive failures.
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

        // Skip a poison event after too many retries.
        if (
          consecutiveFailures >= SKIP_AFTER_RETRIES &&
          consecutiveFailures < MAX_FAILURES
        ) {
          consecutiveFailures = 0;
        }
      }

      // Advance cursor past everything we saw (even with no matches) so we don't
      // re-scan the same events next run.
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
