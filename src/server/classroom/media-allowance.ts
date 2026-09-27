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

/** Statuses whose files count against storage (a failed upload has no file). */
export const STORAGE_COUNTED_STATUSES = ["uploading", "ready"] as const;

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

/** Exact current usage, summed from the records (no calls to S3). */
export async function usageFor(
  payload: Payload,
  communityId: string,
): Promise<MediaUsage> {
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { status: { in: [...STORAGE_COUNTED_STATUSES] } },
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
