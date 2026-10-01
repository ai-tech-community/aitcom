/** A feed post image the member uploaded: what a post links, and its URL. */
export type UploadedFeedImage = { id: number; url: string };

/**
 * Uploads a picture for a feed post (the composer and the edit form) as
 * the member's own feed post image. Throws when the upload fails.
 */
export async function uploadFeedImage(file: File): Promise<UploadedFeedImage> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("alt", "feed post image");
  formData.append("purpose", "feed-post");
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
  return (await res.json()) as UploadedFeedImage;
}
