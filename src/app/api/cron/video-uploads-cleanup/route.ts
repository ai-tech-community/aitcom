import { NextResponse } from "next/server";

import { cleanupAbandonedUploads } from "@/server/communities/video-uploads-cleanup";
import { getVideoStorage } from "@/server/media/video-storage";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs daily to delete files and grants for video uploads nobody
 * finished within ABANDONED_UPLOAD_HOURS. Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { removed, failed } = await cleanupAbandonedUploads({
    payload: await getPayloadClient(),
    storage: getVideoStorage(),
  });

  return NextResponse.json({
    success: true,
    removed,
    failed,
    timestamp: new Date().toISOString(),
  });
}
