import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeXHR } from "@/test/fake-xhr";

const m = vi.hoisted(() => {
  class VideoTooLongError extends Error {}
  class UnsupportedVideoError extends Error {}
  class UndecodablePhotoError extends Error {}
  class PhotoTooLargeError extends Error {}
  return {
    VideoTooLongError,
    UnsupportedVideoError,
    UndecodablePhotoError,
    PhotoTooLargeError,
    /** Every step the pipeline took, in order. */
    log: [] as string[],
    prepareGalleryPhoto: vi.fn(),
    canTranscode: vi.fn(),
    transcodeForUpload: vi.fn(),
    startBatch: vi.fn(),
    startItem: vi.fn(),
    finishItem: vi.fn(),
    discardItem: vi.fn(),
    finishBatch: vi.fn(),
    invalidate: vi.fn(),
  };
});

vi.mock("@/lib/gallery-photo", () => ({
  UndecodablePhotoError: m.UndecodablePhotoError,
  PhotoTooLargeError: m.PhotoTooLargeError,
  prepareGalleryPhoto: m.prepareGalleryPhoto,
}));

vi.mock("@/lib/video-transcode", () => ({
  VideoTooLongError: m.VideoTooLongError,
  UnsupportedVideoError: m.UnsupportedVideoError,
  canTranscode: m.canTranscode,
  transcodeForUpload: m.transcodeForUpload,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: {
        list: { invalidate: m.invalidate },
        facets: { invalidate: m.invalidate },
      },
    }),
    gallery: {
      startBatch: { useMutation: () => ({ mutateAsync: m.startBatch }) },
      startItem: { useMutation: () => ({ mutateAsync: m.startItem }) },
      finishItem: { useMutation: () => ({ mutateAsync: m.finishItem }) },
      discardItem: { useMutation: () => ({ mutateAsync: m.discardItem }) },
      finishBatch: { useMutation: () => ({ mutateAsync: m.finishBatch }) },
    },
  },
}));

import {
  useGalleryUpload,
  type GalleryBatchSettings,
} from "./use-gallery-upload";

/**
 * FakeXHR that logs each POST, fails the URLs in `failing`, and for the URLs
 * in `holding` reports half-way progress then waits for `release(url)`.
 */
class LoggingXHR extends FakeXHR {
  static failing = new Set<string>();
  static holding = new Set<string>();
  static held = new Map<string, () => void>();

  static release(url: string): void {
    LoggingXHR.held.get(url)?.();
  }

  send(form: FormData): void {
    m.log.push(`send ${this.url}`);
    if (LoggingXHR.failing.has(this.url)) {
      queueMicrotask(() => this.onerror?.());
      return;
    }
    if (LoggingXHR.holding.has(this.url)) {
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 5,
        total: 10,
      } as ProgressEvent);
      LoggingXHR.held.set(this.url, () => {
        this.status = 204;
        this.onload?.();
      });
      return;
    }
    super.send(form);
  }
}

const settings: GalleryBatchSettings = {
  eventId: 12,
  topicSlug: "meetups",
  visibility: "community",
  magazineConsent: true,
  caption: "Saturday",
};

const photoA = new File(["a"], "a.jpg", { type: "image/jpeg" });
const photoB = new File(["b"], "b.png", { type: "image/png" });
const clip = new File(["c"], "clip.mov", { type: "video/quicktime" });

function preparedPhoto(name: string) {
  return {
    file: new File([new Uint8Array(300)], name, { type: "image/jpeg" }),
    thumbnail: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
    width: 2048,
    height: 1536,
  };
}

const transcoded = {
  video: new Blob([new Uint8Array(900)], { type: "video/mp4" }),
  thumbnail: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
  durationSeconds: 31.5,
  width: 1280,
  height: 720,
};

let nextItemId = 1;

function grantsFor(itemId: number) {
  return {
    itemId,
    file: {
      url: `https://s3.test/file-${itemId}`,
      fields: { key: `f${itemId}` },
    },
    thumbnail: {
      url: `https://s3.test/thumb-${itemId}`,
      fields: { key: `t${itemId}` },
    },
  };
}

function trpcError(code: string) {
  // tRPC client errors carry the server's message; the gallery sends a code.
  return Object.assign(new Error(code), { data: { code: "BAD_REQUEST" } });
}

function renderIt() {
  return renderHook(() => useGalleryUpload("ai-builders"));
}

async function runToEnd(
  result: { current: ReturnType<typeof useGalleryUpload> },
  files: File[],
) {
  await act(async () => {
    await result.current.start(files, settings);
  });
}

beforeEach(() => {
  m.log.length = 0;
  nextItemId = 1;
  FakeXHR.reset();
  LoggingXHR.failing = new Set();
  LoggingXHR.holding = new Set();
  LoggingXHR.held = new Map();
  vi.stubGlobal("XMLHttpRequest", LoggingXHR);
  m.prepareGalleryPhoto.mockImplementation(async (file: File) => {
    m.log.push(`prepare ${file.name}`);
    return preparedPhoto(file.name);
  });
  m.canTranscode.mockResolvedValue(true);
  m.transcodeForUpload.mockImplementation(async (file: File) => {
    m.log.push(`transcode ${file.name}`);
    return transcoded;
  });
  m.startBatch.mockImplementation(async () => {
    m.log.push("startBatch");
    return { batchId: 77 };
  });
  m.startItem.mockImplementation(async () => {
    const itemId = nextItemId++;
    m.log.push(`startItem ${itemId}`);
    return grantsFor(itemId);
  });
  m.finishItem.mockImplementation(async ({ itemId }: { itemId: number }) => {
    m.log.push(`finishItem ${itemId}`);
    return { id: itemId, status: "ready" };
  });
  m.discardItem.mockImplementation(async ({ itemId }: { itemId: number }) => {
    m.log.push(`discardItem ${itemId}`);
  });
  m.finishBatch.mockImplementation(async () => {
    m.log.push("finishBatch");
    return { readyCount: 3, feedPostId: null };
  });
  m.invalidate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useGalleryUpload", () => {
  it("starts idle with no files", () => {
    const { result } = renderIt();
    expect(result.current.state).toEqual({
      phase: "idle",
      files: [],
      result: null,
    });
  });

  it("uploads the files one at a time, in order, then finishes the batch once", async () => {
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, clip]);

    expect(m.log).toEqual([
      "startBatch",
      "prepare a.jpg",
      "startItem 1",
      "send https://s3.test/file-1",
      "send https://s3.test/thumb-1",
      "finishItem 1",
      "prepare b.png",
      "startItem 2",
      "send https://s3.test/file-2",
      "send https://s3.test/thumb-2",
      "finishItem 2",
      "transcode clip.mov",
      "startItem 3",
      "send https://s3.test/file-3",
      "send https://s3.test/thumb-3",
      "finishItem 3",
      "finishBatch",
    ]);
    expect(m.startBatch).toHaveBeenCalledWith({
      slug: "ai-builders",
      ...settings,
      plannedFiles: 3,
      plannedVideos: 1,
    });
    expect(m.startItem).toHaveBeenNthCalledWith(1, {
      batchId: 77,
      mediaType: "photo",
      contentType: "image/jpeg",
      bytes: 300,
      thumbnailBytes: 100,
      width: 2048,
      height: 1536,
    });
    expect(m.startItem).toHaveBeenNthCalledWith(3, {
      batchId: 77,
      mediaType: "video",
      contentType: "video/mp4",
      bytes: 900,
      thumbnailBytes: 100,
      width: 1280,
      height: 720,
      durationSeconds: 31.5,
    });
    // What reached S3 is what was prepared, with the grant's fields.
    expect(
      FakeXHR.sent.map((sent) => [sent.url, sent.fields, sent.file]),
    ).toEqual([
      [
        "https://s3.test/file-1",
        { key: "f1" },
        { type: "image/jpeg", size: 300 },
      ],
      [
        "https://s3.test/thumb-1",
        { key: "t1" },
        { type: "image/jpeg", size: 100 },
      ],
      [
        "https://s3.test/file-2",
        { key: "f2" },
        { type: "image/jpeg", size: 300 },
      ],
      [
        "https://s3.test/thumb-2",
        { key: "t2" },
        { type: "image/jpeg", size: 100 },
      ],
      [
        "https://s3.test/file-3",
        { key: "f3" },
        { type: "video/mp4", size: 900 },
      ],
      [
        "https://s3.test/thumb-3",
        { key: "t3" },
        { type: "image/jpeg", size: 100 },
      ],
    ]);
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
    expect(m.finishBatch).toHaveBeenCalledWith({ batchId: 77 });
    expect(m.discardItem).not.toHaveBeenCalled();

    const { state } = result.current;
    expect(state.phase).toBe("finished");
    expect(state.result).toEqual({ readyCount: 3, feedPostId: null });
    expect(state.error).toBeUndefined();
    expect(
      state.files.map(({ name, mediaType, phase, progress, error }) => ({
        name,
        mediaType,
        phase,
        progress,
        error,
      })),
    ).toEqual([
      {
        name: "a.jpg",
        mediaType: "photo",
        phase: "done",
        progress: 1,
        error: undefined,
      },
      {
        name: "b.png",
        mediaType: "photo",
        phase: "done",
        progress: 1,
        error: undefined,
      },
      {
        name: "clip.mov",
        mediaType: "video",
        phase: "done",
        progress: 1,
        error: undefined,
      },
    ]);
    expect(new Set(state.files.map((file) => file.id)).size).toBe(3);
    expect(m.invalidate).toHaveBeenCalledWith({ slug: "ai-builders" });
  });

  it("discards a file whose transfer fails, marks it failed, and still uploads the next one", async () => {
    LoggingXHR.failing.add("https://s3.test/file-2");
    m.finishBatch.mockResolvedValue({ readyCount: 2, feedPostId: null });
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, clip]);

    expect(m.log).toEqual([
      "startBatch",
      "prepare a.jpg",
      "startItem 1",
      "send https://s3.test/file-1",
      "send https://s3.test/thumb-1",
      "finishItem 1",
      "prepare b.png",
      "startItem 2",
      "send https://s3.test/file-2",
      "discardItem 2",
      "transcode clip.mov",
      "startItem 3",
      "send https://s3.test/file-3",
      "send https://s3.test/thumb-3",
      "finishItem 3",
    ]);
    expect(m.finishItem).not.toHaveBeenCalledWith({ itemId: 2 });
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
    const { state } = result.current;
    expect(state.files.map((file) => [file.phase, file.error])).toEqual([
      ["done", undefined],
      ["failed", "UPLOAD_FAILED"],
      ["done", undefined],
    ]);
    expect(state.result).toEqual({ readyCount: 2, feedPostId: null });
  });

  it("discards an item the server refuses to finish, and reports the server's code", async () => {
    m.finishItem.mockRejectedValueOnce(trpcError("UPLOAD_FAILED"));
    const { result } = renderIt();
    await runToEnd(result, [photoA]);
    expect(m.discardItem).toHaveBeenCalledWith({ itemId: 1 });
    expect(result.current.state.files[0]).toMatchObject({
      phase: "failed",
      error: "UPLOAD_FAILED",
    });
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "the photo cannot be read",
      "photo",
      () => new m.UndecodablePhotoError(),
      "UNDECODABLE_PHOTO",
    ],
    [
      "the photo stays too big",
      "photo",
      () => new m.PhotoTooLargeError(),
      "FILE_TOO_LARGE",
    ],
    [
      "the clip is too long",
      "video",
      () => new m.VideoTooLongError(),
      "VIDEO_TOO_LONG",
    ],
    [
      "the clip cannot be converted",
      "video",
      () => new m.UnsupportedVideoError(),
      "UNSUPPORTED_VIDEO",
    ],
    [
      "preparing breaks unexpectedly",
      "photo",
      () => new Error("out of memory"),
      "UPLOAD_FAILED",
    ],
  ] as const)(
    "marks a file failed without asking for grants when %s",
    async (_label, kind, error, code) => {
      if (kind === "photo")
        m.prepareGalleryPhoto.mockRejectedValueOnce(error());
      else m.transcodeForUpload.mockRejectedValueOnce(error());
      const { result } = renderIt();
      await runToEnd(result, [kind === "photo" ? photoA : clip]);
      expect(m.startItem).not.toHaveBeenCalled();
      expect(m.discardItem).not.toHaveBeenCalled();
      expect(result.current.state.files[0]).toMatchObject({
        phase: "failed",
        error: code,
      });
      expect(m.finishBatch).toHaveBeenCalledTimes(1);
    },
  );

  it("refuses a video in a browser that cannot convert it, without trying", async () => {
    m.canTranscode.mockResolvedValue(false);
    const { result } = renderIt();
    await runToEnd(result, [clip, photoA]);
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
    expect(
      result.current.state.files.map((file) => [file.phase, file.error]),
    ).toEqual([
      ["failed", "CANNOT_CONVERT_VIDEO"],
      ["done", undefined],
    ]);
  });

  it.each([
    ["FILE_TYPE_NOT_ALLOWED", "FILE_TYPE_NOT_ALLOWED"],
    ["FILE_TOO_LARGE", "FILE_TOO_LARGE"],
    ["upload network error", "UPLOAD_FAILED"],
    ["Internal server error: relation does not exist", "UPLOAD_FAILED"],
  ])(
    "maps a refused grant (%s) to the code %s, never the raw message",
    async (message, code) => {
      m.startItem.mockRejectedValueOnce(trpcError(message));
      const { result } = renderIt();
      await runToEnd(result, [photoA, photoB]);
      expect(m.discardItem).not.toHaveBeenCalled();
      expect(
        result.current.state.files.map((file) => [file.phase, file.error]),
      ).toEqual([
        ["failed", code],
        ["done", undefined],
      ]);
    },
  );

  it.each([
    "UPLOAD_EXPIRED",
    "NOT_A_MEMBER",
    "STORAGE_FULL",
    "UPLOAD_LIMIT",
    "BATCH_TOO_LARGE",
  ])(
    "stops the run once the server answers %s for the whole batch",
    async (code) => {
      m.startItem.mockImplementationOnce(async () => {
        m.log.push("startItem refused");
        throw trpcError(code);
      });
      const { result } = renderIt();
      await runToEnd(result, [photoA, clip, photoB]);
      // Nothing more is prepared: converting a clip just to be refused wastes minutes.
      expect(m.log).toEqual([
        "startBatch",
        "prepare a.jpg",
        "startItem refused",
        "finishBatch",
      ]);
      const { state } = result.current;
      expect(state.files.map((file) => [file.phase, file.error])).toEqual([
        ["failed", code],
        ["waiting", undefined],
        ["waiting", undefined],
      ]);
      // The batch still finished; the refusal is the batch's error too.
      expect(state.phase).toBe("finished");
      expect(state.result).toEqual({ readyCount: 3, feedPostId: null });
      expect(state.error).toBe(code);
    },
  );

  it("a later file that ends the batch keeps earlier uploads and the server's count", async () => {
    m.startItem
      .mockImplementationOnce(async () => grantsFor(nextItemId++))
      .mockRejectedValueOnce(trpcError("STORAGE_FULL"));
    m.finishBatch.mockResolvedValueOnce({ readyCount: 1, feedPostId: null });
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, clip]);
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
    const { state } = result.current;
    expect(state.files.map((file) => [file.phase, file.error])).toEqual([
      ["done", undefined],
      ["failed", "STORAGE_FULL"],
      ["waiting", undefined],
    ]);
    expect(state.error).toBe("STORAGE_FULL");
    expect(state.result).toEqual({ readyCount: 1, feedPostId: null });
  });

  it("attempts no file when the batch is refused, and reports the refusal once", async () => {
    m.startBatch.mockRejectedValueOnce(trpcError("UPLOAD_LIMIT"));
    const { result } = renderIt();
    await runToEnd(result, [photoA, clip]);
    expect(m.prepareGalleryPhoto).not.toHaveBeenCalled();
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
    expect(m.startItem).not.toHaveBeenCalled();
    expect(m.finishBatch).not.toHaveBeenCalled();
    const { state } = result.current;
    expect(state.phase).toBe("finished");
    // The refusal is the batch's; no file carries it.
    expect(state.error).toBe("UPLOAD_LIMIT");
    expect(state.refusedAtStart).toBe(true);
    expect(state.files.map((file) => [file.phase, file.error])).toEqual([
      ["waiting", undefined],
      ["waiting", undefined],
    ]);
  });

  it("a later run that starts its batch is no longer refused at start", async () => {
    m.startBatch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderIt();
    await runToEnd(result, [photoA]);
    expect(result.current.state.refusedAtStart).toBe(true);
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(result.current.state.refusedAtStart).toBe(false);
  });

  it("ends the batch when today's limit is reached part-way, and offers nothing to retry", async () => {
    m.startItem
      .mockImplementationOnce(async () => grantsFor(nextItemId++))
      .mockRejectedValueOnce(trpcError("UPLOAD_LIMIT"));
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, clip]);
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
    const { state } = result.current;
    expect(state.files.map((file) => [file.phase, file.error])).toEqual([
      ["done", undefined],
      ["failed", "UPLOAD_LIMIT"],
      ["waiting", undefined],
    ]);
    expect(state.error).toBe("UPLOAD_LIMIT");
    expect(state.refusedAtStart).toBe(false);
    expect(result.current.retryable).toEqual([]);
  });

  it("reports a failed finish as the batch's error, keeping the files' outcomes", async () => {
    m.finishBatch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderIt();
    await runToEnd(result, [photoA]);
    const { state } = result.current;
    expect(state.phase).toBe("finished");
    expect(state.error).toBe("UPLOAD_FAILED");
    expect(state.result).toBeNull();
    expect(state.files[0]?.phase).toBe("done");
  });

  it("shows preparation and transfer as separate phases, each with its own progress", async () => {
    let finishConversion: (value: typeof transcoded) => void = () => undefined;
    m.transcodeForUpload.mockImplementation(
      (_file: File, opts: { onProgress?: (share: number) => void }) => {
        opts.onProgress?.(0.4);
        return new Promise((resolve) => {
          finishConversion = resolve;
        });
      },
    );
    FakeXHR.mode = "hang";
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([clip], settings);
    });
    await waitFor(() =>
      expect(result.current.state.files[0]).toMatchObject({
        phase: "preparing",
        progress: 0.4,
      }),
    );
    expect(result.current.state.phase).toBe("running");

    await act(async () => finishConversion(transcoded));
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    expect(result.current.state.files[0]).toMatchObject({
      phase: "uploading",
      progress: 0,
    });

    await act(async () => {
      result.current.cancel();
      await pending;
    });
  });

  it("counts the thumbnail in the transfer progress, by size", async () => {
    LoggingXHR.holding = new Set([
      "https://s3.test/file-1",
      "https://s3.test/thumb-1",
    ]);
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    // 300-byte photo, 100-byte thumbnail; each POST is held half-way.
    await waitFor(() =>
      expect(result.current.state.files[0]).toMatchObject({
        phase: "uploading",
        progress: 150 / 400,
      }),
    );
    act(() => LoggingXHR.release("https://s3.test/file-1"));
    await waitFor(() =>
      expect(result.current.state.files[0]).toMatchObject({
        phase: "uploading",
        progress: 350 / 400,
      }),
    );
    await act(async () => {
      LoggingXHR.release("https://s3.test/thumb-1");
      await pending;
    });
    expect(result.current.state.files[0]).toMatchObject({
      phase: "done",
      progress: 1,
    });
  });

  it("cancel stops the current transfer, discards it, and finishes the batch with what is ready", async () => {
    const aborts = vi.spyOn(FakeXHR.prototype, "abort");
    m.finishBatch.mockImplementation(async () => {
      m.log.push("finishBatch");
      return { readyCount: 1, feedPostId: null };
    });
    LoggingXHR.holding = new Set(["https://s3.test/file-2"]);
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA, photoB, clip], settings);
    });
    await waitFor(() => expect(m.log).toContain("send https://s3.test/file-2"));

    await act(async () => {
      result.current.cancel();
      await pending;
    });

    expect(aborts).toHaveBeenCalledTimes(1);
    expect(m.log.slice(-3)).toEqual([
      "send https://s3.test/file-2",
      "discardItem 2",
      "finishBatch",
    ]);
    expect(m.finishItem).toHaveBeenCalledTimes(1);
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
    const { state } = result.current;
    expect(state.phase).toBe("finished");
    expect(state.error).toBeUndefined();
    expect(state.result).toEqual({ readyCount: 1, feedPostId: null });
    // Files that were not sent are left waiting, not failed: nothing went wrong.
    expect(state.files.map((file) => [file.phase, file.error])).toEqual([
      ["done", undefined],
      ["waiting", undefined],
      ["waiting", undefined],
    ]);
  });

  it("cancel during a conversion stops it and finishes the batch without asking for grants", async () => {
    m.transcodeForUpload.mockImplementation(
      (_file: File, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(opts.signal.reason as Error),
          );
        }),
    );
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([clip], settings);
    });
    await waitFor(() => expect(m.transcodeForUpload).toHaveBeenCalled());
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(m.startItem).not.toHaveBeenCalled();
    expect(m.discardItem).not.toHaveBeenCalled();
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
    expect(result.current.state.files[0]?.phase).toBe("waiting");
  });

  it("discards an item whose grant arrives after cancel, without sending anything", async () => {
    let grant: (value: ReturnType<typeof grantsFor>) => void = () => undefined;
    m.startItem.mockImplementation(
      () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    );
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    await waitFor(() => expect(m.startItem).toHaveBeenCalled());
    await act(async () => {
      result.current.cancel();
      grant(grantsFor(5));
      await pending;
    });
    expect(FakeXHR.sent).toEqual([]);
    expect(m.discardItem).toHaveBeenCalledWith({ itemId: 5 });
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
  });

  it("unmounting mid-transfer stops it, discards it and finishes the batch", async () => {
    FakeXHR.mode = "hang";
    const { result, unmount } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    unmount();
    await pending;
    expect(m.discardItem).toHaveBeenCalledWith({ itemId: 1 });
    expect(m.finishBatch).toHaveBeenCalledTimes(1);
  });

  it("ignores a second start while a batch is running", async () => {
    FakeXHR.mode = "hang";
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    await act(async () => {
      await result.current.start([photoB], settings);
    });
    expect(m.startBatch).toHaveBeenCalledTimes(1);
    expect(result.current.state.files.map((file) => file.name)).toEqual([
      "a.jpg",
    ]);
    await act(async () => {
      result.current.cancel();
      await pending;
    });
  });

  it("retryUnsent sends only the files that did not upload, in a new batch, without preparing them again", async () => {
    LoggingXHR.failing.add("https://s3.test/file-2");
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, clip]);
    expect(result.current.state.files[1]?.phase).toBe("failed");

    m.log.length = 0;
    m.startBatch.mockResolvedValueOnce({ batchId: 78 });
    m.finishBatch.mockResolvedValueOnce({ readyCount: 1, feedPostId: null });
    await act(async () => {
      await result.current.retryUnsent();
    });

    expect(m.startBatch).toHaveBeenLastCalledWith({
      slug: "ai-builders",
      ...settings,
      plannedFiles: 1,
      plannedVideos: 0,
    });
    // The prepared photo was kept, so it is not shrunk again.
    expect(m.log).toEqual([
      "startItem 4",
      "send https://s3.test/file-4",
      "send https://s3.test/thumb-4",
      "finishItem 4",
    ]);
    expect(m.finishBatch).toHaveBeenLastCalledWith({ batchId: 78 });
    const { state } = result.current;
    expect(state.phase).toBe("finished");
    expect(state.result).toEqual({ readyCount: 1, feedPostId: null });
    expect(state.files.map((file) => file.phase)).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("retryUnsent after a refused batch tries every file again", async () => {
    m.startBatch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderIt();
    await runToEnd(result, [photoA, clip]);
    expect(result.current.state.error).toBe("UPLOAD_FAILED");

    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ plannedFiles: 2, plannedVideos: 1 }),
    );
    expect(result.current.state.error).toBeUndefined();
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "done",
    ]);
  });

  it("retryUnsent resends the refused file and the ones left waiting after a batch-wide refusal", async () => {
    const photoC = new File(["c"], "c.jpg", { type: "image/jpeg" });
    const photoD = new File(["d"], "d.jpg", { type: "image/jpeg" });
    m.startItem
      .mockImplementationOnce(async () => grantsFor(nextItemId++))
      .mockRejectedValueOnce(trpcError("UPLOAD_EXPIRED"));
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, photoC, photoD]);
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "failed",
      "waiting",
      "waiting",
    ]);

    m.startBatch.mockResolvedValueOnce({ batchId: 78 });
    m.prepareGalleryPhoto.mockClear();
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ plannedFiles: 3, plannedVideos: 0 }),
    );
    // b.png was kept prepared, so it goes first; c and d are shrunk now.
    expect(
      m.prepareGalleryPhoto.mock.calls.map((call) => (call[0] as File).name),
    ).toEqual(["c.jpg", "d.jpg"]);
    expect(m.finishBatch).toHaveBeenLastCalledWith({ batchId: 78 });
    const { state } = result.current;
    expect(state.error).toBeUndefined();
    expect(state.files.map((file) => file.phase)).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("retryUnsent resends the files a cancel left waiting", async () => {
    LoggingXHR.holding = new Set(["https://s3.test/file-2"]);
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA, photoB, clip], settings);
    });
    await waitFor(() => expect(LoggingXHR.held.size).toBe(1));
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "waiting",
      "waiting",
    ]);

    LoggingXHR.holding = new Set();
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ plannedFiles: 2, plannedVideos: 1 }),
    );
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("retryUnsent does nothing while a run is going", async () => {
    FakeXHR.mode = "hang";
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.cancel();
      await pending;
    });
  });

  it("retryUnsent does nothing when every file uploaded", async () => {
    const { result } = renderIt();
    await runToEnd(result, [photoA]);
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenCalledTimes(1);
  });

  it("dropFailed removes the failed files and keeps the rest", async () => {
    LoggingXHR.failing.add("https://s3.test/file-2");
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB, clip]);
    act(() => result.current.dropFailed());
    expect(
      result.current.state.files.map((file) => [file.name, file.phase]),
    ).toEqual([
      ["a.jpg", "done"],
      ["clip.mov", "done"],
    ]);
    // Nothing is left to retry.
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenCalledTimes(1);
  });

  it("keeps at most one converted clip for a retry, so memory stays bounded", async () => {
    const clips = ["one.mov", "two.mov", "three.mov"].map(
      (name) => new File(["c"], name, { type: "video/mp4" }),
    );
    // Every transfer fails (the network dropped): each clip was converted.
    LoggingXHR.failing = new Set(
      [1, 2, 3].map((id) => `https://s3.test/file-${id}`),
    );
    const { result } = renderIt();
    await runToEnd(result, clips);
    expect(m.transcodeForUpload).toHaveBeenCalledTimes(3);

    LoggingXHR.failing = new Set();
    m.transcodeForUpload.mockClear();
    m.log.length = 0;
    await act(async () => {
      await result.current.retryUnsent();
    });
    // Only the last converted clip was kept; it goes first, then the first
    // two are converted again.
    expect(
      m.transcodeForUpload.mock.calls.map((call) => (call[0] as File).name),
    ).toEqual(["one.mov", "two.mov"]);
    // three.mov (kept) went out before anything was converted again.
    expect(m.log.slice(0, 3)).toEqual([
      "startBatch",
      "startItem 4",
      "send https://s3.test/file-4",
    ]);
    expect(m.log.indexOf("transcode one.mov")).toBeGreaterThan(
      m.log.indexOf("finishItem 4"),
    );
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("keeps every prepared photo that failed in transfer for a retry", async () => {
    LoggingXHR.failing = new Set([
      "https://s3.test/file-1",
      "https://s3.test/file-2",
    ]);
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB]);
    LoggingXHR.failing = new Set();
    m.prepareGalleryPhoto.mockClear();
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.prepareGalleryPhoto).not.toHaveBeenCalled();
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "done",
    ]);
  });

  it("keeps a file's prepared output after STORAGE_FULL, which a retry may get past", async () => {
    m.startItem.mockRejectedValueOnce(trpcError("STORAGE_FULL"));
    const { result } = renderIt();
    await runToEnd(result, [clip]);
    expect(result.current.state.files[0]?.error).toBe("STORAGE_FULL");
    // Room may be made, so the file can still be sent again, as converted.
    expect(result.current.retryable.map((file) => file.name)).toEqual([
      "clip.mov",
    ]);

    m.transcodeForUpload.mockClear();
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.transcodeForUpload).not.toHaveBeenCalled();
    expect(result.current.state.files[0]?.phase).toBe("done");
  });

  it("forgets a kept clip before converting another, so two never sit in memory", async () => {
    const one = new File(["c"], "one.mov", { type: "video/mp4" });
    const two = new File(["c"], "two.mov", { type: "video/mp4" });
    // one.mov is converted, then its transfer fails: it is kept for a retry.
    LoggingXHR.failing = new Set(["https://s3.test/file-1"]);
    // two.mov is then converted, and that fails: nothing of it is kept.
    m.transcodeForUpload
      .mockImplementationOnce(async () => transcoded)
      .mockRejectedValueOnce(new m.UnsupportedVideoError());
    const { result } = renderIt();
    await runToEnd(result, [one, two]);

    LoggingXHR.failing = new Set();
    m.transcodeForUpload.mockClear();
    await act(async () => {
      await result.current.retryUnsent();
    });
    // one.mov was let go when two.mov's conversion began, so it is
    // converted again.
    expect(
      m.transcodeForUpload.mock.calls.map((call) => (call[0] as File).name),
    ).toEqual(["one.mov"]);
  });

  it.each(["FILE_TOO_LARGE", "FILE_TYPE_NOT_ALLOWED"])(
    "retryUnsent leaves out a file refused with %s, which would fail again",
    async (code) => {
      m.startItem
        .mockRejectedValueOnce(trpcError(code))
        .mockImplementation(async () => grantsFor(nextItemId++));
      LoggingXHR.failing.add("https://s3.test/file-1");
      const { result } = renderIt();
      await runToEnd(result, [photoA, photoB]);
      expect(
        result.current.state.files.map((file) => [file.phase, file.error]),
      ).toEqual([
        ["failed", code],
        ["failed", "UPLOAD_FAILED"],
      ]);
      expect(result.current.retryable.map((file) => file.name)).toEqual([
        "b.png",
      ]);

      LoggingXHR.failing = new Set();
      await act(async () => {
        await result.current.retryUnsent();
      });
      expect(m.startBatch).toHaveBeenLastCalledWith(
        expect.objectContaining({ plannedFiles: 1 }),
      );
      expect(
        result.current.state.files.map((file) => [file.name, file.phase]),
      ).toEqual([
        ["a.jpg", "failed"],
        ["b.png", "done"],
      ]);
    },
  );

  it("leaves out a photo the browser could not read", async () => {
    m.prepareGalleryPhoto.mockRejectedValueOnce(new m.UndecodablePhotoError());
    const { result } = renderIt();
    await runToEnd(result, [photoA]);
    expect(result.current.state.files[0]?.error).toBe("UNDECODABLE_PHOTO");
    expect(result.current.retryable).toEqual([]);
  });

  it("offers nothing to retry after the batch went over today's limit", async () => {
    m.startBatch.mockRejectedValueOnce(trpcError("UPLOAD_LIMIT"));
    const { result } = renderIt();
    await runToEnd(result, [photoA, photoB]);
    expect(result.current.state.error).toBe("UPLOAD_LIMIT");
    expect(result.current.retryable).toEqual([]);
    await act(async () => {
      await result.current.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenCalledTimes(1);
  });

  it("offers nothing to retry while a run is going", async () => {
    FakeXHR.mode = "hang";
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    await waitFor(() => expect(FakeXHR.sent).toHaveLength(1));
    expect(result.current.retryable).toEqual([]);
    await act(async () => {
      result.current.cancel();
      await pending;
    });
    expect(result.current.retryable.map((file) => file.name)).toEqual([
      "a.jpg",
    ]);
  });

  it("retryUnsent from an earlier render still retries the latest failures", async () => {
    LoggingXHR.holding = new Set(["https://s3.test/file-1"]);
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA], settings);
    });
    await waitFor(() => expect(LoggingXHR.held.size).toBe(1));
    // Captured while nothing has failed yet.
    const early = result.current;
    m.finishItem.mockRejectedValueOnce(trpcError("UPLOAD_FAILED"));
    await act(async () => {
      LoggingXHR.release("https://s3.test/file-1");
      await pending;
    });
    expect(result.current.state.files[0]?.phase).toBe("failed");

    LoggingXHR.holding = new Set();
    await act(async () => {
      await early.retryUnsent();
    });
    expect(m.startBatch).toHaveBeenCalledTimes(2);
    expect(result.current.state.files[0]?.phase).toBe("done");
  });

  it("dropFailed from an earlier render still drops the latest failures", async () => {
    LoggingXHR.holding = new Set(["https://s3.test/file-1"]);
    const { result } = renderIt();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start([photoA, photoB], settings);
    });
    await waitFor(() => expect(LoggingXHR.held.size).toBe(1));
    const early = result.current;
    LoggingXHR.failing = new Set(["https://s3.test/file-2"]);
    await act(async () => {
      LoggingXHR.release("https://s3.test/file-1");
      await pending;
    });
    expect(result.current.state.files.map((file) => file.phase)).toEqual([
      "done",
      "failed",
    ]);
    act(() => early.dropFailed());
    expect(result.current.state.files.map((file) => file.name)).toEqual([
      "a.jpg",
    ]);
  });

  it("a new start replaces the previous files", async () => {
    const { result } = renderIt();
    await runToEnd(result, [photoA]);
    await runToEnd(result, [photoB]);
    expect(result.current.state.files.map((file) => file.name)).toEqual([
      "b.png",
    ]);
    expect(m.finishBatch).toHaveBeenCalledTimes(2);
  });
});
