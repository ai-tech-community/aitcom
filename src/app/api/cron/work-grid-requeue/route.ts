import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { workCells } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: requeues [[work-cell]]s whose deadline has passed so a sleepy grid
 * self-heals (deadline → requeue, ADR-0023). This is the trusted-caller driver
 * for `workGrid.requeueExpired`: that tRPC procedure is gated to a Hub operator
 * (so no logged-in agent owner can requeue the whole platform), and a cron has
 * no operator session, so this route runs the identical requeue write directly
 * behind the same trusted-caller boundary — the `CRON_SECRET` bearer check used
 * by every other cron route.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requeued = await db
    .update(workCells)
    .set({ status: "requeued", claimedBy: null, claimedAt: null })
    .where(and(eq(workCells.status, "claimed"), lt(workCells.deadline, new Date())))
    .returning();

  return NextResponse.json({
    success: true,
    requeuedCells: requeued.length,
    timestamp: new Date().toISOString(),
  });
}
