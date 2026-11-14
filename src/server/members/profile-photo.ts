import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

import { MAX_IMAGE_BYTES, PROFILE_PHOTO_TYPES } from "@/lib/image-uploads";
import type { Media } from "@/payload-types";
import { type db } from "@/server/db";
import { user } from "@/server/db/schema";
import { deletedAccountEmail } from "@/server/members/delete-account";
import type { getPayloadClient } from "@/server/payload";

type Database = typeof db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type ProfilePhotoDeps = {
  db: Database;
  payload: Payload;
  log?: (message: string, detail: unknown) => void;
};

/** The description stored on every profile photo upload. */
export const PROFILE_PHOTO_ALT = "Profile photo";

/**
 * The longest side a stored profile photo keeps. It is shown at most a few
 * hundred pixels wide; more only costs storage and bandwidth.
 */
export const PROFILE_PHOTO_MAX_SIDE = 1024;

/** `user.image` is varchar(255); a longer URL could not be saved. */
const MAX_IMAGE_URL_LENGTH = 255;

/** Pictures larger than this many pixels are refused before decoding. */
const MAX_INPUT_PIXELS = 50_000_000;

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

/** A profile photo ready to store: re-encoded, with its real type. */
type PreparedPhoto = { data: Buffer; mimetype: string; extension: string };

/**
 * Re-encodes an uploaded picture before it is stored. Its type is read from
 * its bytes, never from what the browser claims, so only JPEG, PNG, WebP
 * and GIF pass (no SVG, which can carry script). Re-encoding drops every
 * piece of metadata the file carried (a phone photo's EXIF can hold where
 * it was taken), applies the EXIF rotation first so the picture stays
 * upright, and brings the long side down to PROFILE_PHOTO_MAX_SIDE.
 */
export async function prepareProfilePhoto(
  data: Buffer,
): Promise<PreparedPhoto> {
  if (data.length > MAX_IMAGE_BYTES) {
    throw new ProfilePhotoRejectedError("size");
  }
  const options = { animated: true, limitInputPixels: MAX_INPUT_PIXELS };
  let format: string | undefined;
  try {
    ({ format } = await sharp(data, options).metadata());
  } catch {
    throw new ProfilePhotoRejectedError("type");
  }
  const mimetype = `image/${format}`;
  const extension = PROFILE_PHOTO_TYPES[mimetype];
  if (!format || !extension) throw new ProfilePhotoRejectedError("type");

  try {
    // sharp writes no metadata unless asked to (withMetadata), so the
    // output carries none of the input's.
    const output = await sharp(data, options)
      .rotate()
      .resize({
        width: PROFILE_PHOTO_MAX_SIDE,
        height: PROFILE_PHOTO_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat(format as keyof sharp.FormatEnum)
      .toBuffer();
    return { data: output, mimetype, extension };
  } catch {
    // Decodable header, broken picture.
    throw new ProfilePhotoRejectedError("type");
  }
}

/**
 * Uploads `data` as the member's profile photo and shows it as their
 * picture (`user.image`) everywhere. Their earlier uploaded photos are
 * deleted. Returns the picture the member now has: null when a remove (in
 * another tab) or the account's deletion settled after this upload began.
 */
export async function setProfilePhoto(
  deps: ProfilePhotoDeps,
  input: { userId: string; data: Buffer },
): Promise<{ image: string | null }> {
  const photo = await prepareProfilePhoto(input.data);

  await deps.payload.create({
    collection: "media",
    data: {
      alt: PROFILE_PHOTO_ALT,
      uploadedBy: input.userId,
      purpose: "avatar",
    },
    file: {
      data: photo.data,
      // A random name: the member's own file name may say more than they
      // meant to share, and a fixed one would make Payload count up through
      // every earlier photo to find a free name.
      name: `avatar-${randomUUID()}.${photo.extension}`,
      mimetype: photo.mimetype,
      size: photo.data.length,
    },
  });

  return settlePhotos(deps, input.userId, "newest");
}

/**
 * Takes the member's picture away (`user.image` empty, so they get the
 * Gravatar or their initials) and deletes their uploaded photos. This also
 * clears a picture their sign-in provider gave them. Run after an account
 * deletion too: it then deletes the photos and leaves the row as is.
 */
export async function removeProfilePhoto(
  deps: ProfilePhotoDeps,
  userId: string,
): Promise<void> {
  await settlePhotos(deps, userId, "none");
}

/**
 * The lock every change to one member's profile photo takes, for the
 * length of the caller's transaction. Exported for the unused photos sweep.
 */
export function profilePhotoLock(userId: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${"profile-photo:" + userId}, 0))`;
}

/**
 * Sets `user.image` from the member's uploaded photos and deletes the ones
 * not shown. `newest` shows the most recent upload; `none` shows nothing.
 *
 * Runs one at a time per member, so two uploads at once (two tabs) cannot
 * leave the picture pointing at a deleted file: each run reads every photo
 * uploaded before it, and the newest one always wins. A deleted account
 * shows nothing: an upload that finishes after the deletion stores no
 * picture on the anonymized row and its file is deleted.
 */
async function settlePhotos(
  deps: ProfilePhotoDeps,
  userId: string,
  show: "newest" | "none",
): Promise<{ image: string | null }> {
  return deps.db.transaction(async (tx) => {
    await tx.execute(profilePhotoLock(userId));
    const [account] = await tx
      .select({ email: user.email, image: user.image })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const deleted = !account || account.email === deletedAccountEmail(userId);

    // Newest first: media ids only grow.
    const photos = await photosOf(deps.payload, userId);
    const shown = show === "newest" && !deleted ? photos[0] : undefined;

    let image = account?.image ?? null;
    if (deleted) {
      // Account deletion cleared the picture itself.
    } else if (show === "none") {
      image = null;
      await tx.update(user).set({ image }).where(eq(user.id, userId));
    } else if (shown) {
      image = photoUrl(shown);
      await tx.update(user).set({ image }).where(eq(user.id, userId));
    } else {
      // A remove in another tab took this upload: the picture stays as that
      // remove set it.
    }

    // Inside the lock: a later run must never find a photo this one is
    // about to delete and show it.
    await deletePhotos(
      deps,
      photos.filter((photo) => photo !== shown),
    );
    return { image: shown ? image : null };
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
 * no longer shown, and the unused profile photos sweep deletes it later.
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
