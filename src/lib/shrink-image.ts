/**
 * Makes a picture small enough to upload, on the member's device: phone
 * photos are often larger than the upload limit. Pictures already within
 * `maxBytes`, animated GIFs (a canvas would freeze them) and anything the
 * browser cannot decode are returned as they are; the caller then decides.
 */
export async function shrinkImage(
  file: File,
  { maxBytes, maxSide = 2400 }: { maxBytes: number; maxSide?: number },
): Promise<File> {
  if (file.size <= maxBytes || file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= maxBytes) {
      const name = file.name.replace(/\.[^.]+$/, "") || "picture";
      return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
    }
  }
  return file;
}
