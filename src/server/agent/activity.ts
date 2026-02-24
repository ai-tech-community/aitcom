import type { db as _db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";

type DB = typeof _db;

export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(activityEvents).values({
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
  });
}
