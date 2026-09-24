/**
 * On-device conversion of a picked clip into the upload shape (ADR-0036):
 * a 720p H.264 MP4 plus a JPEG thumbnail.
 *
 * Browser only. Mediabunny needs WebCodecs, so import this module only from
 * client components (never from server code or shared server/client libs).
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
  type InputVideoTrack,
} from "mediabunny";

import {
  AUDIO_BITRATE,
  MAX_VIDEO_SECONDS,
  THUMB_CONTENT_TYPE,
  VIDEO_BITRATE,
  VIDEO_CONTENT_TYPE,
  VIDEO_LONG_SIDE,
  VIDEO_MAX_FPS,
  fitWithin,
} from "./video-rules";

const THUMBNAIL_JPEG_QUALITY = 0.8;

export class VideoTooLongError extends Error {
  constructor() {
    super(`video is longer than ${MAX_VIDEO_SECONDS} seconds`);
    this.name = "VideoTooLongError";
  }
}

export class UnsupportedVideoError extends Error {
  constructor(message = "video cannot be converted") {
    super(message);
    this.name = "UnsupportedVideoError";
  }
}

export type TranscodeResult = {
  video: Blob;
  thumbnail: Blob;
  durationSeconds: number;
  width: number;
  height: number;
};

export type TranscodeOptions = {
  /** Share of the conversion done, from 0 to 1. */
  onProgress?: (share: number) => void;
  /** Aborting rejects with the signal's reason (an `AbortError` by default). */
  signal?: AbortSignal;
};

/** True when this browser can encode H.264 (WebCodecs). */
export async function canTranscode(): Promise<boolean> {
  if (typeof globalThis.VideoEncoder === "undefined") return false;
  return canEncodeVideo("avc", {
    width: VIDEO_LONG_SIDE,
    height: 720,
    frameRate: VIDEO_MAX_FPS,
    quality: new Quality({ bitrate: VIDEO_BITRATE }),
  });
}

/**
 * Converts a picked clip to a 720p H.264 MP4 and a JPEG thumbnail, on the
 * device. Sizes come from the track's display size, which Mediabunny reports
 * after rotation, so portrait phone clips stay portrait. The rotation is baked
 * into the frames rather than kept as file metadata, so every player and the
 * thumbnail agree. A clip without (usable) audio converts to a silent video;
 * only a missing video track is refused.
 */
export async function transcodeForUpload(
  file: File,
  opts: TranscodeOptions,
): Promise<TranscodeResult> {
  const { signal } = opts;
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    signal?.throwIfAborted();
    // Unknown containers would otherwise surface as UnsupportedInputFormatError.
    if (!(await input.canRead())) {
      throw new UnsupportedVideoError("unrecognized file format");
    }
    const durationSeconds = await input.computeDuration();
    if (durationSeconds > MAX_VIDEO_SECONDS) throw new VideoTooLongError();
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new UnsupportedVideoError("no video track");
    const displayWidth = await track.getDisplayWidth();
    const displayHeight = await track.getDisplayHeight();
    if (!(displayWidth > 0 && displayHeight > 0)) {
      throw new UnsupportedVideoError("video has no picture size");
    }
    const size = fitWithin(displayWidth, displayHeight);

    if (!(await canEncodeAudio("aac"))) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
    signal?.throwIfAborted();

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
        width: size.width,
        height: size.height,
        fit: "fill",
        frameRate: VIDEO_MAX_FPS,
        quality: new Quality({ bitrate: VIDEO_BITRATE }),
        forceTranscode: true,
        allowTransformationMetadata: false,
      },
      audio: { codec: "aac", quality: new Quality({ bitrate: AUDIO_BITRATE }) },
      showWarnings: false,
    });
    // A missing audio track is fine; a missing video track is not.
    const lostVideo = conversion.discardedTracks.some(
      (entry) => entry.track.type === "video",
    );
    if (!conversion.isValid || lostVideo) throw new UnsupportedVideoError();

    conversion.onProgress = (share) => opts.onProgress?.(share);
    await runCancellable(conversion, signal);

    const thumbnail = await firstFrameJpeg(track, size);
    // An abort that lands as the run finishes still means "cancelled".
    signal?.throwIfAborted();

    if (!target.buffer) throw new UnsupportedVideoError("empty output");
    return {
      video: new Blob([target.buffer], { type: VIDEO_CONTENT_TYPE }),
      thumbnail,
      durationSeconds,
      width: size.width,
      height: size.height,
    };
  } finally {
    input.dispose();
  }
}

/** Runs the conversion, cancelling it when `signal` aborts. */
async function runCancellable(
  conversion: Conversion,
  signal: AbortSignal | undefined,
): Promise<void> {
  const onAbort = () => void conversion.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    // The listener does not fire for an abort that happened before it was added.
    signal?.throwIfAborted();
    await conversion.execute();
  } catch (error) {
    // Report a cancel as the caller's abort, not Mediabunny's ConversionCanceledError.
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  signal?.throwIfAborted();
}

async function firstFrameJpeg(
  track: InputVideoTrack,
  size: { width: number; height: number },
): Promise<Blob> {
  const sink = new CanvasSink(track, { ...size, fit: "fill" });
  const frame = await sink.getCanvas(await track.getFirstTimestamp());
  if (!frame) throw new UnsupportedVideoError("no first frame");
  const { canvas } = frame;
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({
      type: THUMB_CONTENT_TYPE,
      quality: THUMBNAIL_JPEG_QUALITY,
    });
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new UnsupportedVideoError("no thumbnail")),
      THUMB_CONTENT_TYPE,
      THUMBNAIL_JPEG_QUALITY,
    ),
  );
}
