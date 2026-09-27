import { UPLOAD_GRANT_SECONDS } from "@/lib/video-rules";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A community's hosted-media limits (spec 2026-09-27 §7). Slice 2 has stored
 * files only; slice 3 adds stored video and monthly viewing.
 */
export type MediaAllowance = { fileBytesStored: number };
export type MediaUsage = { fileBytesStored: number };

export const DEFAULT_MEDIA_ALLOWANCE: MediaAllowance = {
  fileBytesStored: 5 * 1024 ** 3,
};

/** Statuses whose files always count against storage. */
export const STORAGE_COUNTED_STATUSES = ["uploading", "ready"] as const;

/**
 * How long after a record is created its presigned POST may still work. The
 * grant is signed just after the record is written and lives
 * UPLOAD_GRANT_SECONDS; the extra minute covers the gap between the two.
 */
export const UPLOAD_GRANT_LIVE_SECONDS = UPLOAD_GRANT_SECONDS + 60;

/**
 * Whether the upload grant of a record created at `createdAt` may still be
 * used. While it may, S3 can still receive a full-size object at the key, so
 * the record keeps counting against storage even when it is failed or
 * deleted by the author.
 */
export function mayUploadGrantBeLive(createdAt: string, now: Date): boolean {
  return (
    new Date(createdAt).getTime() >
    now.getTime() - UPLOAD_GRANT_LIVE_SECONDS * 1000
  );
}

/**
 * A community's allowance. Today every community gets the defaults; this is
 * the one place paid plans will change. Upload checks and the settings usage
 * bar both read from here.
 */
export async function allowanceFor(
  _communityId: string,
): Promise<MediaAllowance> {
  return DEFAULT_MEDIA_ALLOWANCE;
}

/**
 * Current usage, summed from the records (no calls to S3): uploading and
 * ready files, plus failed ones whose upload grant may still be live — the
 * grant could still store a full-size object at their key.
 */
export async function usageFor(
  payload: Payload,
  communityId: string,
  now: Date = new Date(),
): Promise<MediaUsage> {
  const grantLiveSince = new Date(
    now.getTime() - UPLOAD_GRANT_LIVE_SECONDS * 1000,
  ).toISOString();
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { communityId: { equals: communityId } },
        {
          or: [
            { status: { in: [...STORAGE_COUNTED_STATUSES] } },
            {
              and: [
                { status: { equals: "failed" } },
                { createdAt: { greater_than: grantLiveSince } },
              ],
            },
          ],
        },
      ],
    },
    pagination: false,
    depth: 0,
  });
  return {
    fileBytesStored: docs.reduce((sum, doc) => sum + doc.bytes, 0),
  };
}

/** The storage limit is hard: refuse anything that would pass it. */
export function exceedsAllowance(
  usage: MediaUsage,
  allowance: MediaAllowance,
  extraBytes: number,
): boolean {
  return usage.fileBytesStored + extraBytes > allowance.fileBytesStored;
}
