import { NextResponse } from "next/server";

import { cleanupAbandonedMaterialUploads } from "@/server/classroom/material-uploads-cleanup";
import { sweepUnusedFeedImages } from "@/server/communities/unused-feed-images-sweep";
import { sweepUnusedVideoFiles } from "@/server/communities/unused-video-files-sweep";
import { cleanupAbandonedUploads } from "@/server/communities/video-uploads-cleanup";
import { db } from "@/server/db";
import { cleanupAbandonedGalleryUploads } from "@/server/gallery/cleanup";
import { galleryEnabled } from "@/server/gallery/flag";
import { sweepUnusedGalleryFiles } from "@/server/gallery/unused-files-sweep";
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
/**
 * A gallery sweep while the gallery is switched off: the S3 permissions for
 * its folders arrive with the flag, and no gallery rows exist before it.
 */
const GALLERY_DISABLED = { skipped: "gallery disabled" } as const;

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
 * finished within ABANDONED_UPLOAD_HOURS — Reels video grants, classroom
 * file uploads and gallery uploads (closing gallery batches left open and
 * announcing them in the feed, and deleting empty ones) — and then the
 * Reels video files no live post or open grant points at any more, the feed
 * post images no post links, and the gallery files no gallery item points
 * at. Protected by CRON_SECRET
 * header. The path keeps its old name so the Vercel cron schedule is
 * unchanged.
 *
 * The sweeps are independent: one throwing does not stop the others. The
 * response keeps the video counts at the top level (as before), the
 * classroom counts under `materials`, the gallery counts under `gallery`,
 * the unused video files under `unusedVideoFiles`, the unused feed images
 * under `unusedFeedImages` and the unused gallery files under
 * `unusedGalleryFiles`; a sweep that threw reports null and makes the run
 * answer 500 so the cron shows as failed. The three unused-file sweeps run
 * in production only (see `ownsStorageContents`) and report themselves
 * skipped elsewhere. Both gallery sweeps run only while the gallery is
 * switched on (`galleryEnabled`) and report themselves skipped otherwise.
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
  const galleryOn = galleryEnabled();
  const gallery = galleryOn
    ? await runSweep("gallery", () =>
        cleanupAbandonedGalleryUploads({
          payload,
          db,
          storage: getObjectStorage,
        }),
      )
    : GALLERY_DISABLED;
  // After the abandoned grants are gone, so their files are not counted
  // twice. Only production's database knows everything in the shared bucket.
  const ownsStorage = ownsStorageContents();
  const unusedVideoFiles = ownsStorage
    ? await runSweep<UnusedSweepResult>("unused video files", () =>
        sweepUnusedVideoFiles({ payload, storage: getObjectStorage }),
      )
    : NOT_PRODUCTION;
  // Deleting a feed image deletes its files in the shared bucket, and
  // another environment's database may hold copies of production's images.
  const unusedFeedImages = ownsStorage
    ? await runSweep("unused feed images", () =>
        sweepUnusedFeedImages({ payload }),
      )
    : NOT_PRODUCTION;
  const unusedGalleryFiles = !galleryOn
    ? GALLERY_DISABLED
    : ownsStorage
      ? await runSweep<UnusedSweepResult>("unused gallery files", () =>
          sweepUnusedGalleryFiles({ payload, storage: getObjectStorage }),
        )
      : NOT_PRODUCTION;
  const success =
    videos !== null &&
    materials !== null &&
    gallery !== null &&
    unusedVideoFiles !== null &&
    unusedFeedImages !== null &&
    unusedGalleryFiles !== null;

  return NextResponse.json(
    {
      success,
      removed: videos?.removed ?? null,
      failed: videos?.failed ?? null,
      materials,
      gallery,
      unusedVideoFiles,
      unusedFeedImages,
      unusedGalleryFiles,
      timestamp: new Date().toISOString(),
    },
    { status: success ? 200 : 500 },
  );
}
