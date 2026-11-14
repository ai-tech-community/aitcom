import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { MAX_IMAGE_BYTES, PROFILE_PHOTO_TYPES } from "@/lib/image-uploads";
import type { Media } from "@/payload-types";
import { type db } from "@/server/db";
import { user } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";

type Database = typeof db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type ProfilePhotoDeps = {
  db: Database;
  payload: Payload;
  log?: (message: string, detail: unknown) => void;
};

/** A picture as the upload route received it. */
export type ProfilePhotoFile = { data: Buffer; mimetype: string };

/** The description stored on every profile photo upload. */
export const PROFILE_PHOTO_ALT = "Profile photo";

/** `user.image` is varchar(255); a longer URL could not be saved. */
const MAX_IMAGE_URL_LENGTH = 255;

/** Why a picture cannot become a profile photo, for the route to explain. */
export class ProfilePhotoRejectedError extends Error {
  constructor(readonly reason: "type" | "size") {
    super(
      reason === "type"
        ? "Use a JPG, PNG, WebP, or GIF picture."
        : "The picture is too large (max 2 MB).",
    );
    this.name = "ProfilePhotoRejectedError";
  }
}

/**
 * Uploads `file` as the member's profile photo and shows it as their
 * picture (`user.image`) everywhere. Their earlier uploaded photos are
 * deleted. Returns the picture the member now has.
 */
export async function setProfilePhoto(
  deps: ProfilePhotoDeps,
  input: { userId: string; file: ProfilePhotoFile },
): Promise<{ image: string | null }> {
  const extension = PROFILE_PHOTO_TYPES[input.file.mimetype];
  if (!extension) throw new ProfilePhotoRejectedError("type");
  if (input.file.data.length > MAX_IMAGE_BYTES) {
    throw new ProfilePhotoRejectedError("size");
  }

  await deps.payload.create({
    collection: "media",
    data: {
      alt: PROFILE_PHOTO_ALT,
      uploadedBy: input.userId,
      purpose: "avatar",
    },
    file: {
      data: input.file.data,
      // A random name: the member's own file name may say more than they
      // meant to share, and a fixed one would make Payload count up through
      // every earlier photo to find a free name.
      name: `avatar-${randomUUID()}.${extension}`,
      mimetype: input.file.mimetype,
      size: input.file.data.length,
    },
  });

  return settlePhotos(deps, input.userId, "newest");
}

/**
 * Takes the member's picture away (`user.image` empty, so they get the
 * Gravatar or their initials) and deletes their uploaded photos. This also
 * clears a picture their sign-in provider gave them.
 */
export async function removeProfilePhoto(
  deps: ProfilePhotoDeps,
  userId: string,
): Promise<void> {
  await settlePhotos(deps, userId, "none");
}

/**
 * Deletes every profile photo the member uploaded, without touching
 * `user.image`. For account deletion, which clears `user.image` itself.
 */
export async function deleteProfilePhotoFiles(
  deps: Pick<ProfilePhotoDeps, "payload" | "log">,
  userId: string,
): Promise<void> {
  await deletePhotos(deps, await photosOf(deps.payload, userId));
}

/**
 * Sets `user.image` from the member's uploaded photos and deletes the ones
 * not shown. `newest` shows the most recent upload; `none` shows nothing.
 *
 * Runs one at a time per member, so two uploads at once (two tabs) cannot
 * leave the picture pointing at a deleted file: each run reads every photo
 * uploaded before it, and the newest one always wins.
 */
async function settlePhotos(
  deps: ProfilePhotoDeps,
  userId: string,
  show: "newest" | "none",
): Promise<{ image: string | null }> {
  return deps.db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"profile-photo:" + userId}, 0))`,
    );
    // Newest first: media ids only grow.
    const photos = await photosOf(deps.payload, userId);
    const shown = show === "newest" ? photos[0] : undefined;

    if (show === "none") {
      await tx.update(user).set({ image: null }).where(eq(user.id, userId));
    } else if (shown) {
      await tx
        .update(user)
        .set({ image: photoUrl(shown) })
        .where(eq(user.id, userId));
    }
    // With nothing to show (a remove in another tab took this upload), the
    // picture is left as that remove set it.

    // Inside the lock: a later run must never find a photo this one is
    // about to delete and show it.
    await deletePhotos(
      deps,
      photos.filter((photo) => photo !== shown),
    );

    const [row] = await tx
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return { image: row?.image ?? null };
  });
}

/** The member's uploaded profile photos, newest first. */
async function photosOf(payload: Payload, userId: string): Promise<Media[]> {
  const { docs } = await payload.find({
    collection: "media",
    where: {
      and: [
        { uploadedBy: { equals: userId } },
        { purpose: { equals: "avatar" } },
      ],
    },
    sort: "-id",
    depth: 0,
    pagination: false,
  });
  return docs;
}

/**
 * The square crop when Payload made one (pictures smaller than it get none),
 * otherwise the picture itself.
 */
export function photoUrl(photo: Media): string {
  const url = photo.sizes?.thumbnail?.url ?? photo.url;
  if (!url || url.length > MAX_IMAGE_URL_LENGTH) {
    throw new Error(`Profile photo ${photo.id} has no usable URL`);
  }
  return url;
}

/**
 * Deletes photos one by one. A failure is logged and skipped: the photo is
 * no longer shown, and the next change or the account deletion retries it.
 */
async function deletePhotos(
  deps: Pick<ProfilePhotoDeps, "payload" | "log">,
  photos: Media[],
): Promise<void> {
  for (const photo of photos) {
    try {
      await deps.payload.delete({ collection: "media", id: photo.id });
    } catch (error) {
      (deps.log ?? console.error)("[profile-photo] deleting a photo failed", {
        mediaId: photo.id,
        error,
      });
    }
  }
}
