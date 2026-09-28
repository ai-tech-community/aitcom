import { NextResponse } from "next/server";

import { cleanupAbandonedMaterialUploads } from "@/server/classroom/material-uploads-cleanup";
import { cleanupAbandonedUploads } from "@/server/communities/video-uploads-cleanup";
import { getObjectStorage } from "@/server/media/object-storage";
import { getVideoStorage } from "@/server/media/video-storage";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SweepResult = { removed: number; failed: number };

/** Runs one sweep; a sweep that throws is logged and reported as null. */
async function runSweep(
  name: string,
  sweep: () => Promise<SweepResult>,
): Promise<SweepResult | null> {
  try {
    return await sweep();
  } catch (error) {
    console.error(`[video-uploads-cleanup] ${name} sweep failed`, error);
    return null;
  }
}

/**
 * Cron job: runs daily to delete the files and records of uploads nobody
 * finished within ABANDONED_UPLOAD_HOURS — Reels video grants and classroom
 * file uploads. Protected by CRON_SECRET header. The path keeps its old name
 * so the Vercel cron schedule is unchanged.
 *
 * The two sweeps are independent: one throwing does not stop the other. The
 * response keeps the video counts at the top level (as before) and adds the
 * classroom counts under `materials`; a sweep that threw reports null and
 * makes the run answer 500 so the cron shows as failed.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();
  // Lazy storage: only reached when an abandoned upload's files need removing.
  const videos = await runSweep("videos", () =>
    cleanupAbandonedUploads({ payload, storage: getVideoStorage }),
  );
  const materials = await runSweep("materials", () =>
    cleanupAbandonedMaterialUploads({ payload, storage: getObjectStorage }),
  );
  const success = videos !== null && materials !== null;

  return NextResponse.json(
    {
      success,
      removed: videos?.removed ?? null,
      failed: videos?.failed ?? null,
      materials,
      timestamp: new Date().toISOString(),
    },
    { status: success ? 200 : 500 },
  );
}
