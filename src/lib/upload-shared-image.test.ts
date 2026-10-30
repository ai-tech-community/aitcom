import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_IMAGE_BYTES } from "@/lib/image-uploads";

import { ImageUploadError, uploadSharedImage } from "./upload-shared-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadSharedImage", () => {
  it("posts an image to /api/upload with the same limits the cover route enforces", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: "https://cdn.example/a.png" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["png"], "diagram.png", { type: "image/png" });

    await expect(uploadSharedImage(file, "  diagram  ")).resolves.toBe(
      "https://cdn.example/a.png",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/upload");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("alt")).toBe("diagram");
  });

  it("refuses a non-image and a file over 2 MB before calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const text = new File(["hi"], "notes.txt", { type: "text/plain" });
    const huge = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.png", {
      type: "image/png",
    });

    await expect(uploadSharedImage(text, "notes")).rejects.toThrow(
      /Only images are allowed/,
    );
    await expect(uploadSharedImage(huge, "big")).rejects.toThrow(
      /File too large \(max 2MB\)/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Only images are allowed" }), {
            status: 400,
          }),
      ),
    );
    const file = new File(["x"], "x.png", { type: "image/png" });
    await expect(uploadSharedImage(file, "")).rejects.toBeInstanceOf(
      ImageUploadError,
    );
  });
});
