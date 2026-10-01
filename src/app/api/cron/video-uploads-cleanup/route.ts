import { NextResponse } from "next/server";

import { cleanupAbandonedMaterialUploads } from "@/server/classroom/material-uploads-cleanup";
import { sweepUnusedVideoFiles } from "@/server/communities/unused-video-files-sweep";
import { cleanupAbandonedUploads } from "@/server/communities/video-uploads-cleanup";
import { getObjectStorage } from "@/server/media/object-storage";
import { ownsStorageContents } from "@/server/media/storage-ownership";
import { getVideoStorage } from "@/server/media/video-storage";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SweepResult = { removed: number; failed: number };
type UnusedSweepResult = SweepResult & { scanned: number };
/** A reachability sweep outside production: it would delete production's files. */
const NOT_PRODUCTION = { skipped: "not production" } as const;

/** Runs one sweep; a sweep that throws is logged and reported as null. */
async function runSweep<T extends SweepResult>(
  name: string,
  sweep: () => Promise<T>,
): Promise<T | null> {
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
 * file uploads — and then the Reels video files no live post or open grant
 * points at any more. Protected by CRON_SECRET header. The path keeps its
 * old name so the Vercel cron schedule is unchanged.
 *
 * The sweeps are independent: one throwing does not stop the others. The
 * response keeps the video counts at the top level (as before), the
 * classroom counts under `materials` and the unused video files under
 * `unusedVideoFiles`; a sweep that threw reports null and makes the run
 * answer 500 so the cron shows as failed. The unused-file sweep runs in
 * production only (see `ownsStorageContents`) and reports itself skipped
 * elsewhere.
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
  // After the abandoned grants are gone, so their files are not counted
  // twice. Only production's database knows everything in the shared bucket.
  const ownsStorage = ownsStorageContents();
  const unusedVideoFiles = ownsStorage
    ? await runSweep<UnusedSweepResult>("unused video files", () =>
        sweepUnusedVideoFiles({ payload, storage: getObjectStorage }),
      )
    : NOT_PRODUCTION;
  const success =
    videos !== null && materials !== null && unusedVideoFiles !== null;

  return NextResponse.json(
    {
      success,
      removed: videos?.removed ?? null,
      failed: videos?.failed ?? null,
      materials,
      unusedVideoFiles,
      timestamp: new Date().toISOString(),
    },
    { status: success ? 200 : 500 },
  );
}
