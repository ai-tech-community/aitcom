import { MAX_IMAGE_BYTES, PROFILE_PHOTO_TYPES } from "@/lib/image-uploads";
import { shrinkImage } from "@/lib/shrink-image";

/** Why a photo did not upload, in terms the settings row can explain. */
export class ProfilePhotoUploadError extends Error {
  constructor(readonly reason: "type" | "size" | "failed") {
    super(`Profile photo upload failed: ${reason}`);
    this.name = "ProfilePhotoUploadError";
  }
}

/**
 * Uploads `file` as the member's profile photo, shrinking it on the device
 * first when it is over the upload limit (phone photos often are). The
 * server shows it everywhere at once. Throws a ProfilePhotoUploadError.
 */
export async function uploadProfilePhoto(
  file: File,
): Promise<{ image: string | null }> {
  if (!PROFILE_PHOTO_TYPES[file.type]) {
    throw new ProfilePhotoUploadError("type");
  }
  const picture = await shrinkImage(file, { maxBytes: MAX_IMAGE_BYTES });
  if (picture.size > MAX_IMAGE_BYTES) {
    throw new ProfilePhotoUploadError("size");
  }
  const body = new FormData();
  body.append("file", picture);
  const res = await fetch("/api/profile-photo", { method: "POST", body });
  if (!res.ok) {
    const reason = await res
      .json()
      .then((json: { reason?: unknown }) => json.reason)
      .catch(() => undefined);
    throw new ProfilePhotoUploadError(
      reason === "type" || reason === "size" ? reason : "failed",
    );
  }
  return (await res.json()) as { image: string | null };
}
