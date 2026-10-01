import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";
import { shrinkImage } from "@/lib/shrink-image";

/** A feed post image the member uploaded: what a post links, and its URL. */
export type UploadedFeedImage = { id: number; url: string };

/** Why a picture did not upload, in terms the editor can explain. */
export class FeedImageUploadError extends Error {
  constructor(readonly reason: "tooLarge" | "failed") {
    super(reason === "tooLarge" ? "Picture too large" : "Upload failed");
    this.name = "FeedImageUploadError";
  }
}

/**
 * Uploads a picture for a feed post (the composer and the edit form) as
 * the member's own feed post image, shrinking it on the device first when
 * it is over the upload limit. Throws a FeedImageUploadError.
 */
export async function uploadFeedImage(file: File): Promise<UploadedFeedImage> {
  const picture = await shrinkImage(file, { maxBytes: MAX_IMAGE_BYTES });
  if (picture.size > MAX_IMAGE_BYTES) {
    throw new FeedImageUploadError("tooLarge");
  }
  const formData = new FormData();
  formData.append("file", picture);
  formData.append("alt", "");
  formData.append("purpose", "feed-post");
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new FeedImageUploadError("failed");
  return (await res.json()) as UploadedFeedImage;
}
