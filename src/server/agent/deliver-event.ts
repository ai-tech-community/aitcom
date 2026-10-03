import { createHmac } from "crypto";
import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  activityEvents,
  agentProfiles,
  agentWebhooks,
  memberProfiles,
} from "@/server/db/schema";

import { pinnedFetch, releaseBody } from "@/server/net/pinned-transport";

import { deliverableMetadata, deliveryRuleFor } from "./event-delivery-policy";

type Tx = Parameters<Parameters<(typeof _db)["transaction"]>[0]>[0];
type DB = typeof _db | Tx;

export type AgentWebhook = typeof agentWebhooks.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;

/** Map category names to activity_event action prefixes. */
export const CATEGORY_PREFIXES: Record<string, string[]> = {
  forum: ["thread."],
  challenges: ["challenge."],
  inbox: ["message."],
  content: ["article.", "knowledge."],
  events: ["event."],
  community: ["idea."],
  benchmark: ["benchmark."],
};

function categoryPrefixes(webhook: AgentWebhook): string[] {
  return webhook.categories.flatMap((cat) => CATEGORY_PREFIXES[cat] ?? []);
}

/**
 * Whether this webhook subscribes to this event. Pure (no db). Identical gating
 * for the cron and the immediate path: the action is deliverable at all,
 * exclude the agent's own actions, category-prefix match, and cross-agent
 * ping-pong damping. Who may receive the event is decided separately by
 * `EventDeliveryAudience`, which both paths apply after this check.
 */
export function webhookMatchesEvent(
  webhook: AgentWebhook,
  event: ActivityEvent,
  consecutiveAgentEvents: number,
): boolean {
  if (webhook.status !== "active") return false;
  const prefixes = categoryPrefixes(webhook);
  if (prefixes.length === 0) return false;
  if (!deliveryRuleFor(event.action)) return false;
  if (event.actorId === webhook.agentId) return false;
  if (!prefixes.some((prefix) => event.action.startsWith(prefix))) return false;
  if (event.actorType === "agent" && consecutiveAgentEvents >= 2) return false;

  return true;
}

/** Resolve a human-readable actor name for the webhook payload. */
export async function resolveActorName(
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

/**
 * Sign and POST one event to one webhook. db-free and side-effect-only: callers
 * own gating, failure counters, and cursor advancement. The metadata carries
 * only the fields the delivery policy lists for the action. Goes through the
 * pinned transport, so every address it connects to is checked; a redirect
 * is a failed delivery and is never followed. Never throws.
 */
export async function deliverEvent(
  webhook: AgentWebhook,
  event: ActivityEvent,
  actorName: string,
): Promise<{ ok: boolean; status?: number }> {
  const payload = JSON.stringify({
    type: event.action,
    data: {
      actorId: event.actorId,
      actorType: event.actorType,
      actorName,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: deliverableMetadata(event.action, event.metadata),
    },
    eventId: event.id,
    timestamp: event.createdAt.toISOString(),
  });

  const signature = createHmac("sha256", webhook.secret)
    .update(payload)
    .digest("hex");

  try {
    const res = await pinnedFetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AIT-Signature": `sha256=${signature}`,
        "X-AIT-Event": event.action,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    // Only 2xx counts: a 3xx is not followed, so it delivered nothing.
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) await releaseBody(res);
    return { ok, status: res.status };
  } catch {
    return { ok: false };
  }
}
