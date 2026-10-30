import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";

/**
 * Uploads one image through `/api/upload`, the same path an issue cover uses.
 * The route stores the file in the media collection (S3) and checks the same
 * limits again: images only, at most {@link MAX_IMAGE_BYTES}.
 */
export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

export async function uploadSharedImage(
  file: File,
  alt: string,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new ImageUploadError("Only images are allowed");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageUploadError("File too large (max 2MB)");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("alt", alt.trim() || "upload");
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    const message =
      body && typeof body.error === "string" ? body.error : "Upload failed";
    throw new ImageUploadError(message);
  }
  const json = (await res.json()) as { url?: unknown };
  if (typeof json.url !== "string" || json.url.length === 0) {
    throw new ImageUploadError("Upload failed");
  }
  return json.url;
}
