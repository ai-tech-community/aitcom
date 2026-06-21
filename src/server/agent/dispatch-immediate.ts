import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { agentWebhooks } from "@/server/db/schema";
import { validateWebhookUrl } from "./validate-webhook-url";
import {
  type ActivityEvent,
  type AgentWebhook,
  deliverEvent,
  resolveActorName,
  webhookMatchesEvent,
} from "./deliver-event";

type Tx = Parameters<Parameters<(typeof _db)["transaction"]>[0]>[0];
type DB = typeof _db | Tx;

/**
 * Realtime agent wake (ADR-0025 Tier-2). Deliver a freshly-written event to
 * matching enabled webhooks immediately, as a latency optimization over the
 * cron. The cron remains the sole cursor owner and re-delivers the same event on
 * its next tick (≤1 min), so this is at-least-once (bounded 2× per message);
 * agents dedup on `eventId`. We deliberately do NOT touch the cursor here — it is
 * shared across all of a webhook's categories, so advancing it from this
 * inbox-only path could skip an unrelated event. Best-effort: never throws (it
 * runs inside `after()`). Scoped to inbox (`message.*`) events.
 */
export async function dispatchEventImmediately(
  db: DB,
  event: ActivityEvent,
): Promise<void> {
  if (!event.action.startsWith("message.")) return;

  let webhooks: AgentWebhook[];
  try {
    webhooks = await db
      .select()
      .from(agentWebhooks)
      .where(eq(agentWebhooks.isEnabled, true));
  } catch (err) {
    console.error("[webhook-immediate] failed to load webhooks:", err);
    return;
  }

  for (const webhook of webhooks) {
    try {
      if (!webhookMatchesEvent(webhook, event, webhook.consecutiveAgentEvents)) {
        continue;
      }

      const urlCheck = await validateWebhookUrl(webhook.url);
      if (!urlCheck.ok) continue; // the cron owns auto-disable for bad URLs

      const actorName = await resolveActorName(db, event.actorId, event.actorType);
      const outcome = await deliverEvent(webhook, event, actorName);
      console.log(
        `[webhook-immediate] webhook=${webhook.id} event=${event.id} ok=${outcome.ok}`,
      );
    } catch (err) {
      console.error(`[webhook-immediate] error for webhook ${webhook.id}:`, err);
    }
  }
}
