import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GALLERY_PHOTO_MAX_BYTES,
  GALLERY_THUMB_MAX_BYTES,
} from "@/lib/gallery-rules";
import { fakeBitmap, installFakeCanvas } from "@/test/fake-canvas";

import {
  PhotoTooLargeError,
  UndecodablePhotoError,
  prepareGalleryPhoto,
} from "./gallery-photo";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A JPEG encoder whose output grows with the canvas area and the quality. */
function areaEncoder(bytesPerPixelAtFull: number) {
  return (canvas: HTMLCanvasElement, quality: number | undefined) =>
    Math.round(
      canvas.width * canvas.height * bytesPerPixelAtFull * (quality ?? 1),
    );
}

function decodeTo(width: number, height: number) {
  const bitmap = fakeBitmap(width, height);
  const decode = vi.fn(async () => bitmap);
  vi.stubGlobal("createImageBitmap", decode);
  return { bitmap, decode };
}

const phonePhoto = new File([new Uint8Array(64)], "IMG_0042.png", {
  type: "image/png",
});

describe("prepareGalleryPhoto", () => {
  it("makes a JPEG of at most 2048 px and 4 MB, plus a 480 px thumbnail", async () => {
    installFakeCanvas(areaEncoder(0.5));
    const { bitmap, decode } = decodeTo(4032, 3024);

    const out = await prepareGalleryPhoto(phonePhoto);

    expect(decode).toHaveBeenCalledWith(phonePhoto, {
      imageOrientation: "from-image",
    });
    expect([out.width, out.height]).toEqual([2048, 1536]);
    expect(out.file.type).toBe("image/jpeg");
    expect(out.file.name).toBe("IMG_0042.jpg");
    expect(out.file.size).toBeLessThanOrEqual(GALLERY_PHOTO_MAX_BYTES);
    expect(out.file.size).toBe(Math.round(2048 * 1536 * 0.5 * 0.85));
    expect(out.thumbnail.type).toBe("image/jpeg");
    expect(out.thumbnail.size).toBe(Math.round(480 * 360 * 0.5 * 0.85));
    expect(out.thumbnail.size).toBeLessThanOrEqual(GALLERY_THUMB_MAX_BYTES);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("lowers the quality until the photo fits in 4 MB", async () => {
    // At 0.85 a 2048×1536 photo is ~5.3 MB; at 0.7 ~4.4 MB; at 0.55 ~3.5 MB.
    installFakeCanvas(areaEncoder(2));
    decodeTo(4032, 3024);
    const out = await prepareGalleryPhoto(phonePhoto);
    expect(out.file.size).toBe(Math.round(2048 * 1536 * 2 * 0.55));
    expect(out.file.size).toBeLessThanOrEqual(GALLERY_PHOTO_MAX_BYTES);
  });

  it("re-encodes a small photo to JPEG without enlarging it", async () => {
    installFakeCanvas(areaEncoder(0.5));
    decodeTo(800, 600);
    const out = await prepareGalleryPhoto(
      new File(["x"], "tiny.webp", { type: "image/webp" }),
    );
    expect([out.width, out.height]).toEqual([800, 600]);
    expect(out.file.type).toBe("image/jpeg");
    expect(out.file.name).toBe("tiny.jpg");
    expect(out.thumbnail.size).toBe(Math.round(480 * 360 * 0.5 * 0.85));
  });

  it("names a photo without a usable name 'photo.jpg'", async () => {
    installFakeCanvas(areaEncoder(0.5));
    decodeTo(10, 10);
    const out = await prepareGalleryPhoto(
      new File(["x"], ".png", { type: "image/png" }),
    );
    expect(out.file.name).toBe("photo.jpg");
  });

  it("throws UndecodablePhotoError when the browser cannot read the photo (HEIC in Chrome)", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException(
          "The source image could not be decoded.",
          "InvalidStateError",
        );
      }),
    );
    const heic = new File(["x"], "IMG_1.HEIC", { type: "image/heic" });
    await expect(prepareGalleryPhoto(heic)).rejects.toBeInstanceOf(
      UndecodablePhotoError,
    );
  });

  it("throws PhotoTooLargeError when even the lowest quality is over 4 MB", async () => {
    installFakeCanvas(() => GALLERY_PHOTO_MAX_BYTES + 1);
    const { bitmap } = decodeTo(4032, 3024);
    await expect(prepareGalleryPhoto(phonePhoto)).rejects.toBeInstanceOf(
      PhotoTooLargeError,
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("throws PhotoTooLargeError when the thumbnail cannot fit 512 KB", async () => {
    installFakeCanvas((canvas) =>
      canvas.width <= 480 ? GALLERY_THUMB_MAX_BYTES + 1 : 100,
    );
    decodeTo(4032, 3024);
    await expect(prepareGalleryPhoto(phonePhoto)).rejects.toBeInstanceOf(
      PhotoTooLargeError,
    );
  });
});
