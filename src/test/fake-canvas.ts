import { vi } from "vitest";

/** What `createImageBitmap` hands back in tests: just a size and `close`. */
export type FakeBitmap = { width: number; height: number; close: () => void };

export function fakeBitmap(width: number, height: number): FakeBitmap {
  return { width, height, close: vi.fn() };
}

/**
 * jsdom has no 2D canvas. Gives every canvas a context whose `fillRect` (with
 * the `fillStyle` at the time) and `drawImage` are recorded, and a `toBlob`
 * that encodes to `bytesFor(canvas, quality)` bytes (null makes the
 * browser's "could not encode" answer). Returns the spies; restore with
 * `vi.restoreAllMocks()`.
 */
export function installFakeCanvas(
  bytesFor: (
    canvas: HTMLCanvasElement,
    quality: number | undefined,
  ) => number | null,
) {
  const drawImage = vi.fn();
  /** Each fillRect call's fillStyle, in order. */
  const fills: string[] = [];
  const fillRect = vi.fn();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => {
      const context = {
        fillStyle: "#000000",
        drawImage,
        fillRect: (...args: number[]) => {
          fills.push(context.fillStyle);
          fillRect(...args);
        },
      };
      return context as unknown as CanvasRenderingContext2D;
    });
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
      quality?: number,
    ) {
      const bytes = bytesFor(this, quality);
      callback(
        bytes === null ? null : new Blob([new Uint8Array(bytes)], { type }),
      );
    });
  return { drawImage, fillRect, fills, getContext, toBlob };
}
