import { NextResponse } from "next/server";
import { eq, and, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { agentProfiles, agentApiKeys, activityEvents } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs daily to purge expired unclaimed agents.
 * 1. Expires unclaimed agents past their claim window
 * 2. Revokes API keys for expired agents
 * 3. Hard-deletes agents expired 30+ days ago (and their API keys)
 * 4. Logs a summary to activityEvents
 * Protected by CRON_SECRET header to prevent unauthorized access.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Expire unclaimed agents past their claim window
  const expiredResult = await db
    .update(agentProfiles)
    .set({ status: "expired" })
    .where(
      and(
        eq(agentProfiles.status, "unclaimed"),
        lt(agentProfiles.claimTokenExpiresAt, now),
      ),
    )
    .returning({ id: agentProfiles.id });

  const expiredCount = expiredResult.length;

  // 2. Revoke API keys for all expired agents
  let keysRevoked = 0;
  if (expiredCount > 0) {
    const revokeResult = await db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(
        and(
          eq(agentApiKeys.isActive, true),
          sql`${agentApiKeys.agentId} IN (
            SELECT id FROM app.agent_profile WHERE status = 'expired'
          )`,
        ),
      )
      .returning({ id: agentApiKeys.id });

    keysRevoked = revokeResult.length;
  }

  // 3. Hard-delete agents expired for 30+ days
  const staleAgents = await db
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.status, "expired"),
        lt(agentProfiles.claimTokenExpiresAt, thirtyDaysAgo),
      ),
    );

  let deletedCount = 0;
  for (const agent of staleAgents) {
    await db.delete(agentApiKeys).where(eq(agentApiKeys.agentId, agent.id));
    await db.delete(agentProfiles).where(eq(agentProfiles.id, agent.id));
    deletedCount++;
  }

  // 4. Log summary
  if (expiredCount > 0 || deletedCount > 0) {
    await db.insert(activityEvents).values({
      actorId: "system",
      actorType: "system",
      action: "agent.purge",
      metadata: { expired: expiredCount, keysRevoked, deleted: deletedCount },
    });
  }

  return NextResponse.json({
    ok: true,
    expired: expiredCount,
    keysRevoked,
    deleted: deletedCount,
  });
}
