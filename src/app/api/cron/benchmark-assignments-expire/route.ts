import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { benchmarkAssignments } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks held assignments past `expires_at` as `expired`, freeing their
 * prompts back to the virtual open pool. Per ADR-0008 Step 5: expiry
 * carries no penalty for the contributor.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await db
      .update(benchmarkAssignments)
      .set({ status: "expired" })
      .where(
        and(
          eq(benchmarkAssignments.status, "held"),
          sql`${benchmarkAssignments.expiresAt} < now()`,
        ),
      )
      .returning({ id: benchmarkAssignments.id });
    return NextResponse.json({
      success: true,
      expired: result.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[benchmark-assignments-expire] error", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
