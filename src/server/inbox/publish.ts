import { Redis } from "@upstash/redis";

import { env } from "@/env";

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  redis ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

export const inboxUserChannel = (userId: string) => `inbox:user:${userId}`;

/** Best-effort fanout. Persistence already succeeded; failure degrades to poll. */
export async function publishInboxEvent(
  recipientUserId: string,
  payload: unknown,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.publish(inboxUserChannel(recipientUserId), JSON.stringify(payload));
  } catch (err) {
    console.error("[inbox] upstash publish failed", err);
  }
}
