/** JPEG qualities tried in order, best first, until the result fits. */
const JPEG_QUALITIES = [0.85, 0.7, 0.55];

/**
 * Draws a decoded picture on a new canvas, its long side brought down to
 * `maxSide` (never enlarged), over white: JPEG has no transparency, and
 * transparent pixels would otherwise turn black. The bitmap stays open: the
 * caller may draw it again at another size, and closes it. Throws when the
 * browser gives no 2D context.
 */
export function drawScaled(
  bitmap: ImageBitmap,
  maxSide: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2D canvas context");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Encodes a canvas as JPEG at the first quality whose result is at most
 * `maxBytes`. Null when none fits or the browser cannot encode it.
 */
export async function canvasToJpeg(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  qualities: readonly number[] = JPEG_QUALITIES,
): Promise<Blob | null> {
  for (const quality of qualities) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= maxBytes) return blob;
  }
  return null;
}

/** `holiday.png` → `holiday.jpg`; a name with nothing before the dot → `fallback.jpg`. */
export function jpegName(fileName: string, fallback: string): string {
  return `${fileName.replace(/\.[^.]+$/, "") || fallback}.jpg`;
}

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
  let canvas: HTMLCanvasElement;
  try {
    canvas = drawScaled(bitmap, maxSide);
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
  const blob = await canvasToJpeg(canvas, maxBytes);
  if (!blob) return file;
  return new File([blob], jpegName(file.name, "picture"), {
    type: "image/jpeg",
  });
}
