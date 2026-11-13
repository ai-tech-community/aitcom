import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeBitmap, installFakeCanvas } from "@/test/fake-canvas";

import { canvasToJpeg, drawScaled, shrinkImage } from "./shrink-image";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

describe("drawScaled", () => {
  it("draws the picture with its long side brought down to maxSide", () => {
    const { drawImage } = installFakeCanvas(() => 1);
    const bitmap = fakeBitmap(4000, 3000);
    const canvas = drawScaled(bitmap as unknown as ImageBitmap, 2048);
    expect([canvas.width, canvas.height]).toEqual([2048, 1536]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1536);
    // The caller owns the bitmap (it may draw it again at another size).
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it("keeps portrait pictures portrait", () => {
    installFakeCanvas(() => 1);
    const canvas = drawScaled(
      fakeBitmap(1000, 3000) as unknown as ImageBitmap,
      480,
    );
    expect([canvas.width, canvas.height]).toEqual([160, 480]);
  });

  it("never enlarges a small picture", () => {
    installFakeCanvas(() => 1);
    const canvas = drawScaled(
      fakeBitmap(300, 200) as unknown as ImageBitmap,
      2048,
    );
    expect([canvas.width, canvas.height]).toEqual([300, 200]);
  });

  it("throws when the browser gives no 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() =>
      drawScaled(fakeBitmap(10, 10) as unknown as ImageBitmap, 10),
    ).toThrow();
  });
});

describe("canvasToJpeg", () => {
  it("returns the best quality that fits, trying the qualities in order", async () => {
    const { toBlob } = installFakeCanvas((_canvas, quality) =>
      quality === 0.85 ? 900 : 400,
    );
    const blob = await canvasToJpeg(canvasOf(10, 10), 500);
    expect(blob?.size).toBe(400);
    expect(blob?.type).toBe("image/jpeg");
    expect(toBlob.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ["image/jpeg", 0.85],
      ["image/jpeg", 0.7],
    ]);
  });

  it("uses the qualities it is given", async () => {
    const { toBlob } = installFakeCanvas(() => 10);
    await canvasToJpeg(canvasOf(10, 10), 500, [0.9]);
    expect(toBlob.mock.calls.map((call) => call[2])).toEqual([0.9]);
  });

  it("returns null when no quality fits", async () => {
    installFakeCanvas(() => 900);
    await expect(canvasToJpeg(canvasOf(10, 10), 500)).resolves.toBeNull();
  });

  it("returns null when the browser cannot encode the canvas", async () => {
    installFakeCanvas(() => null);
    await expect(canvasToJpeg(canvasOf(10, 10), 500)).resolves.toBeNull();
  });
});

describe("shrinkImage", () => {
  it("returns a picture already within the limit as it is", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const small = new File(["abc"], "a.png", { type: "image/png" });
    await expect(shrinkImage(small, { maxBytes: 10 })).resolves.toBe(small);
    expect(decode).not.toHaveBeenCalled();
  });

  it("re-encodes a large picture as a JPEG within the limit", async () => {
    installFakeCanvas((canvas) => canvas.width);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => fakeBitmap(4800, 2400)),
    );
    const big = new File([new Uint8Array(5000)], "holiday.png", {
      type: "image/png",
    });
    const out = await shrinkImage(big, { maxBytes: 4000 });
    expect(out.name).toBe("holiday.jpg");
    expect(out.type).toBe("image/jpeg");
    // Long side capped at the default 2400 px.
    expect(out.size).toBe(2400);
  });

  it("returns the original when the browser cannot decode it", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("bad", "InvalidStateError");
      }),
    );
    const big = new File([new Uint8Array(50)], "a.heic", {
      type: "image/heic",
    });
    await expect(shrinkImage(big, { maxBytes: 10 })).resolves.toBe(big);
  });

  it("returns the original when the browser has no 2D canvas", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const bitmap = fakeBitmap(100, 100);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap),
    );
    const big = new File([new Uint8Array(50)], "a.png", { type: "image/png" });
    await expect(shrinkImage(big, { maxBytes: 10 })).resolves.toBe(big);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("returns the original when no quality fits", async () => {
    installFakeCanvas(() => 999);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => fakeBitmap(100, 100)),
    );
    const big = new File([new Uint8Array(50)], "a.png", { type: "image/png" });
    await expect(shrinkImage(big, { maxBytes: 10 })).resolves.toBe(big);
  });
});
