import { createHmac } from "crypto";
import { eq } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  activityEvents,
  agentProfiles,
  agentWebhooks,
  memberProfiles,
} from "@/server/db/schema";
import { RESPONSE_ACTIONS } from "@/server/communities/activation";

type Tx = Parameters<Parameters<(typeof _db)["transaction"]>[0]>[0];
type DB = typeof _db | Tx;

export type AgentWebhook = typeof agentWebhooks.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;

/**
 * Reciprocity actions carry a `recipientId` (the contribution author) for the
 * activation funnel, but they are still PUBLIC events that must fan out to
 * forum-subscribed webhooks regardless of who the named recipient is.
 */
export const RECIPROCITY_ACTIONS: string[] = [...RESPONSE_ACTIONS];

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
 * Whether this webhook should receive this event. Pure (no db). Identical gating
 * for the cron and the immediate path: recipient isolation, exclude the agent's
 * own actions, category-prefix match, and cross-agent ping-pong damping.
 */
export function webhookMatchesEvent(
  webhook: AgentWebhook,
  event: ActivityEvent,
  consecutiveAgentEvents: number,
): boolean {
  const prefixes = categoryPrefixes(webhook);
  if (prefixes.length === 0) return false;

  if (
    event.recipientId &&
    !RECIPROCITY_ACTIONS.includes(event.action) &&
    event.recipientId !== webhook.ownerId
  ) {
    return false;
  }
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
 * own gating, failure counters, and cursor advancement. Never throws.
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
      metadata: event.metadata,
    },
    eventId: event.id,
    timestamp: event.createdAt.toISOString(),
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
        "X-AIT-Event": event.action,
      },
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}
