/**
 * Prepares a picked photo for the community gallery, on the member's device
 * (spec 2026-11-13, Storage): always re-encoded to JPEG with its long side at
 * most GALLERY_PHOTO_MAX_SIDE and at most GALLERY_PHOTO_MAX_BYTES, plus a
 * thumbnail of at most GALLERY_THUMB_MAX_SIDE and GALLERY_THUMB_MAX_BYTES.
 * Re-encoding also drops the original's metadata (location included).
 *
 * Browser only: needs `createImageBitmap` and a canvas.
 */
import {
  GALLERY_PHOTO_MAX_BYTES,
  GALLERY_PHOTO_MAX_SIDE,
  GALLERY_THUMB_MAX_BYTES,
  GALLERY_THUMB_MAX_SIDE,
} from "@/lib/gallery-rules";
import { canvasToJpeg, drawScaled, jpegName } from "@/lib/shrink-image";

/** The browser cannot read this photo (HEIC in Chrome, a damaged file). */
export class UndecodablePhotoError extends Error {
  constructor() {
    super("photo cannot be decoded");
    this.name = "UndecodablePhotoError";
  }
}

/** Even at the lowest JPEG quality the photo or its thumbnail is too big. */
export class PhotoTooLargeError extends Error {
  constructor() {
    super("photo is too large after shrinking");
    this.name = "PhotoTooLargeError";
  }
}

export type PreparedGalleryPhoto = {
  file: File;
  thumbnail: Blob;
  /** Of `file`, in pixels. */
  width: number;
  height: number;
};

export async function prepareGalleryPhoto(
  file: File,
): Promise<PreparedGalleryPhoto> {
  let bitmap: ImageBitmap;
  try {
    // Turn phone photos upright before their orientation tag is dropped.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UndecodablePhotoError();
  }
  try {
    const photo = drawScaled(bitmap, GALLERY_PHOTO_MAX_SIDE);
    const photoJpeg = await canvasToJpeg(photo, GALLERY_PHOTO_MAX_BYTES);
    if (!photoJpeg) throw new PhotoTooLargeError();
    const thumbnail = await canvasToJpeg(
      drawScaled(bitmap, GALLERY_THUMB_MAX_SIDE),
      GALLERY_THUMB_MAX_BYTES,
    );
    if (!thumbnail) throw new PhotoTooLargeError();
    return {
      file: new File([photoJpeg], jpegName(file.name, "photo"), {
        type: "image/jpeg",
      }),
      thumbnail,
      width: photo.width,
      height: photo.height,
    };
  } finally {
    bitmap.close();
  }
}
