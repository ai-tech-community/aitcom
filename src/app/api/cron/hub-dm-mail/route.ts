import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { backfillUnreadHubDmMailFromDb } from "@/server/notifications/hub-dm-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Idempotent unread-Hub-DM mail backfill. Safe to run on every deploy and
 * on a short cadence: one ping per unread conversation, DM toggle respected.
 */
export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await backfillUnreadHubDmMailFromDb(db);
  return NextResponse.json({ success: true, ...result });
}
