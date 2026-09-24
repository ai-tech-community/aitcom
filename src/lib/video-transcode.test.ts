import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeConversion = {
  isValid: boolean;
  discardedTracks: Array<{ track: { type: string }; reason: string }>;
  onProgress?: (progress: number, processedTime: number) => unknown;
  execute: () => Promise<void>;
  cancel: () => Promise<void>;
};

const mb = vi.hoisted(() => ({
  duration: 30,
  readable: true,
  track: null as unknown,
  init: vi.fn(),
  isValid: true,
  discarded: [] as Array<{ track: { type: string }; reason: string }>,
  /** Replaces the default "finish at once" execute when set. */
  execute: null as null | ((conversion: FakeConversion) => Promise<void>),
  cancel: vi.fn(),
  dispose: vi.fn(),
  registerAac: vi.fn(),
  nativeAac: true,
}));

vi.mock("mediabunny", () => {
  class ConversionCanceledError extends Error {}
  class Input {
    canRead = async () => mb.readable;
    computeDuration = async () => mb.duration;
    getPrimaryVideoTrack = async () => mb.track;
    dispose() {
      mb.dispose();
    }
  }
  class Output {}
  class BufferTarget {
    buffer: ArrayBuffer | null = new ArrayBuffer(8);
  }
  class CanvasSink {
    getCanvas = async () => ({
      canvas: {
        convertToBlob: async () => new Blob(["jpg"], { type: "image/jpeg" }),
      },
      timestamp: 0,
      duration: 1 / 30,
    });
  }
  return {
    Input,
    Output,
    CanvasSink,
    BufferTarget,
    ConversionCanceledError,
    BlobSource: class {},
    Mp4OutputFormat: class {},
    Quality: class {
      constructor(public opts: unknown) {}
    },
    ALL_FORMATS: [],
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => mb.nativeAac,
    Conversion: {
      init: async (opts: unknown) => {
        mb.init(opts);
        let rejectRun: ((error: Error) => void) | null = null;
        const conversion: FakeConversion = {
          isValid: mb.isValid,
          discardedTracks: mb.discarded,
          execute: () =>
            new Promise<void>((resolve, reject) => {
              rejectRun = reject;
              if (mb.execute) mb.execute(conversion).then(resolve, reject);
              else resolve();
            }),
          cancel: async () => {
            mb.cancel();
            rejectRun?.(new ConversionCanceledError("canceled"));
          },
        };
        return conversion;
      },
    },
  };
});
vi.mock("@mediabunny/aac-encoder", () => ({
  registerAacEncoder: () => {
    mb.registerAac();
  },
}));

import {
  UnsupportedVideoError,
  VideoTooLongError,
  readVideoDuration,
  transcodeForUpload,
} from "./video-transcode";

const file = new File(["x"], "clip.mov", { type: "video/quicktime" });
/** A phone clip stored landscape with 90-degree rotation metadata. */
const portraitTrack = () => ({
  // Mediabunny's display size is already post-rotation.
  getDisplayWidth: async () => 1080,
  getDisplayHeight: async () => 1920,
  getFirstTimestamp: async () => 0,
});

beforeEach(() => {
  mb.duration = 30;
  mb.readable = true;
  mb.track = portraitTrack();
  mb.init.mockReset();
  mb.isValid = true;
  mb.discarded = [];
  mb.execute = null;
  mb.cancel.mockReset();
  mb.dispose.mockReset();
  mb.registerAac.mockReset();
  mb.nativeAac = true;
});

describe("transcodeForUpload", () => {
  it("keeps portrait clips portrait, using the display (post-rotation) size", async () => {
    const result = await transcodeForUpload(file, {});
    const opts = mb.init.mock.calls[0]![0] as {
      video: Record<string, unknown>;
    };
    expect(opts.video).toMatchObject({
      codec: "avc",
      width: 720,
      height: 1280,
      fit: "fill",
      frameRate: 30,
      forceTranscode: true,
      // Rotation is baked into the frames, not left as file metadata.
      allowTransformationMetadata: false,
    });
    expect(result).toMatchObject({
      width: 720,
      height: 1280,
      durationSeconds: 30,
    });
    expect(result.video.type).toBe("video/mp4");
    expect(result.video.size).toBe(8);
    expect(result.thumbnail.type).toBe("image/jpeg");
    expect(mb.dispose).toHaveBeenCalledTimes(1);
  });

  it("refuses clips over 90 seconds before converting", async () => {
    mb.duration = 91;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(
      VideoTooLongError,
    );
    expect(mb.init).not.toHaveBeenCalled();
    expect(mb.dispose).toHaveBeenCalledTimes(1);
  });

  it("accepts clips with no audio track", async () => {
    mb.discarded = [
      { track: { type: "audio" }, reason: "undecodable_source_codec" },
    ];
    await expect(transcodeForUpload(file, {})).resolves.toMatchObject({
      width: 720,
    });
  });

  it("refuses files without a usable video track", async () => {
    mb.track = null;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(
      UnsupportedVideoError,
    );
    mb.track = portraitTrack();
    mb.isValid = false;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(
      UnsupportedVideoError,
    );
    mb.isValid = true;
    mb.discarded = [
      { track: { type: "video" }, reason: "undecodable_source_codec" },
    ];
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(
      UnsupportedVideoError,
    );
  });

  it("refuses files in a format it cannot read, before probing them", async () => {
    mb.readable = false;
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(
      UnsupportedVideoError,
    );
    expect(mb.init).not.toHaveBeenCalled();
    expect(mb.dispose).toHaveBeenCalledTimes(1);
  });

  it("refuses a video track with no picture size", async () => {
    mb.track = {
      ...portraitTrack(),
      getDisplayWidth: async () => 0,
      getDisplayHeight: async () => 0,
    };
    await expect(transcodeForUpload(file, {})).rejects.toBeInstanceOf(
      UnsupportedVideoError,
    );
    expect(mb.init).not.toHaveBeenCalled();
  });

  it("registers the fallback AAC encoder only when the browser has none", async () => {
    await transcodeForUpload(file, {});
    expect(mb.registerAac).not.toHaveBeenCalled();
    mb.nativeAac = false;
    await transcodeForUpload(file, {});
    expect(mb.registerAac).toHaveBeenCalledTimes(1);
  });

  it("reports progress as a share between 0 and 1", async () => {
    mb.execute = async (conversion) => {
      conversion.onProgress?.(0.5, 15);
      conversion.onProgress?.(1, 30);
    };
    const onProgress = vi.fn();
    await transcodeForUpload(file, { onProgress });
    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
  });
});

describe("transcodeForUpload cancelling", () => {
  it("rejects at once when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transcodeForUpload(file, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mb.init).not.toHaveBeenCalled();
    expect(mb.dispose).toHaveBeenCalledTimes(1);
  });

  it("cancels a running conversion and rejects with the abort reason", async () => {
    const controller = new AbortController();
    mb.execute = () => {
      controller.abort();
      return new Promise<void>(() => undefined); // only cancel() ends it
    };
    await expect(
      transcodeForUpload(file, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mb.cancel).toHaveBeenCalledTimes(1);
    expect(mb.dispose).toHaveBeenCalledTimes(1);
  });

  it("never resolves with a buffer when the abort lands as the run finishes", async () => {
    const controller = new AbortController();
    mb.execute = async () => {
      controller.abort();
    };
    await expect(
      transcodeForUpload(file, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("swallows a failing cancel, still rejecting with the abort reason", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      mb.cancel.mockImplementation(() => {
        throw new Error("conversion already finished");
      });
      const controller = new AbortController();
      mb.execute = async () => {
        controller.abort();
      };
      await expect(
        transcodeForUpload(file, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mb.cancel).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("readVideoDuration", () => {
  it("reads the length in seconds and frees the file", async () => {
    mb.duration = 42.5;
    await expect(readVideoDuration(file)).resolves.toBe(42.5);
    expect(mb.dispose).toHaveBeenCalledTimes(1);
    expect(mb.init).not.toHaveBeenCalled();
  });

  it("refuses a file it cannot read, and still frees it", async () => {
    mb.readable = false;
    await expect(readVideoDuration(file)).rejects.toBeInstanceOf(
      UnsupportedVideoError,
    );
    expect(mb.dispose).toHaveBeenCalledTimes(1);
  });
});
