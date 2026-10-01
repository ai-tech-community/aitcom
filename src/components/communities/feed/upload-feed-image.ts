/**
 * Uploads a picture for a feed post (the composer and the edit form) and
 * returns its public URL. Throws when the upload fails.
 */
export async function uploadFeedImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("alt", "feed post image");
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
  const data = (await res.json()) as { url: string };
  return data.url;
}
