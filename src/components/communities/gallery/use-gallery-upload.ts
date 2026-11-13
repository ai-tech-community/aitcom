"use client";

import { useEffect, useRef, useState } from "react";

import {
  PhotoTooLargeError,
  UndecodablePhotoError,
  prepareGalleryPhoto,
} from "@/lib/gallery-photo";
import {
  isGalleryErrorCode,
  type GalleryErrorCode,
  type GalleryMediaType,
} from "@/lib/gallery-rules";
import { uploadToGrant } from "@/lib/upload-to-grant";
import {
  UnsupportedVideoError,
  VideoTooLongError,
  canTranscode,
  transcodeForUpload,
} from "@/lib/video-transcode";
import { api, type RouterInputs, type RouterOutputs } from "@/trpc/react";

/** What the member chose for the whole batch in the upload dialog. */
export type GalleryBatchSettings = Omit<
  RouterInputs["gallery"]["startBatch"],
  "slug" | "plannedFiles" | "plannedVideos"
>;

/**
 * Why a file or the batch did not upload: a server refusal code, or one of
 * the browser's own. Codes only — the UI turns them into translated copy.
 * Anything unrecognised is `UPLOAD_FAILED`.
 */
export type GalleryUploadErrorCode =
  | GalleryErrorCode
  /** The browser cannot read the photo (HEIC in Chrome, a damaged file). */
  | "UNDECODABLE_PHOTO"
  | "VIDEO_TOO_LONG"
  /** The clip cannot be read or has no picture. */
  | "UNSUPPORTED_VIDEO"
  /** This browser has no H.264 encoder, so no clip can be converted here. */
  | "CANNOT_CONVERT_VIDEO";

export type GalleryUploadFilePhase =
  | "waiting"
  /** Shrinking a photo or converting a clip; `progress` is that step's share. */
  | "preparing"
  /** Sending the file and its thumbnail; `progress` is the share sent. */
  | "uploading"
  | "done"
  | "failed";

export type GalleryUploadFile = {
  id: string;
  name: string;
  mediaType: GalleryMediaType;
  phase: GalleryUploadFilePhase;
  /** From 0 to 1, within the current phase. */
  progress: number;
  error?: GalleryUploadErrorCode;
};

export type GalleryBatchResult = RouterOutputs["gallery"]["finishBatch"];

export type GalleryUploadState = {
  phase: "idle" | "running" | "finished";
  files: GalleryUploadFile[];
  /** The batch itself failed to start or to finish. */
  error?: GalleryUploadErrorCode;
  /** The server's answer to finishing the latest batch: the authority. */
  result: GalleryBatchResult | null;
};

/** A file shrunk or converted and ready to send. */
type PreparedFile = {
  mediaType: GalleryMediaType;
  blob: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  durationSeconds?: number;
};

/**
 * Prepared output kept so a retry skips shrinking or converting again:
 * every photo (at most 4.5 MB each), but at most one clip — a converted clip
 * is up to 40 MB held in memory, and phones must stay within bounds (spec
 * 2026-11-13, Upload flow). Keeping a new clip forgets the previous one.
 */
class PreparedCache {
  private readonly entries = new Map<string, PreparedFile>();

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): PreparedFile | undefined {
    return this.entries.get(id);
  }

  keep(id: string, output: PreparedFile): void {
    if (output.mediaType === "video") {
      for (const [otherId, other] of this.entries) {
        if (other.mediaType === "video") this.entries.delete(otherId);
      }
    }
    this.entries.set(id, output);
  }

  forget(id: string): void {
    this.entries.delete(id);
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Refusals that hold for every remaining file of the batch: the batch's
 * window closed, the member left, the gallery was switched off, or the
 * community's storage is full. The run stops there: the remaining files are
 * not prepared (converting a clip only to be refused wastes minutes) and
 * stay waiting; the refusal is the batch's error.
 */
const BATCH_ENDING_CODES: ReadonlySet<GalleryUploadErrorCode> = new Set([
  "UPLOAD_EXPIRED",
  "NOT_A_MEMBER",
  "GALLERY_DISABLED",
  "STORAGE_FULL",
]);

/**
 * Refusals a retry of the same prepared file cannot get past, so its
 * prepared output is not kept for one.
 */
const RETRY_FUTILE_CODES: ReadonlySet<GalleryUploadErrorCode> = new Set([
  "STORAGE_FULL",
  "FILE_TOO_LARGE",
  "FILE_TYPE_NOT_ALLOWED",
  "NOT_A_MEMBER",
  "GALLERY_DISABLED",
]);

/** The browser has no H.264 encoder, so nothing was tried. */
class CannotConvertHereError extends Error {}

export function galleryMediaTypeOf(file: File): GalleryMediaType {
  return file.type.startsWith("video/") ? "video" : "photo";
}

function errorCodeFor(error: unknown): GalleryUploadErrorCode {
  if (error instanceof UndecodablePhotoError) return "UNDECODABLE_PHOTO";
  if (error instanceof PhotoTooLargeError) return "FILE_TOO_LARGE";
  if (error instanceof CannotConvertHereError) return "CANNOT_CONVERT_VIDEO";
  if (error instanceof VideoTooLongError) return "VIDEO_TOO_LONG";
  if (error instanceof UnsupportedVideoError) return "UNSUPPORTED_VIDEO";
  // A gallery refusal travels as the tRPC error's message.
  const message = (error as { message?: unknown } | null)?.message;
  return isGalleryErrorCode(message) ? message : "UPLOAD_FAILED";
}

const INITIAL_STATE: GalleryUploadState = {
  phase: "idle",
  files: [],
  result: null,
};

/**
 * Uploads a batch of photos and videos to a community's gallery (spec
 * 2026-11-13, Upload flow). `start` opens one batch on the server, then
 * takes the files one at a time, in order — so a phone converts one clip at
 * a time and each ten-minute grant is asked for only when its file is
 * ready: prepare (shrink the photo or convert the clip) → `startItem` → send
 * the file and its thumbnail straight to S3 → `finishItem`. A file that
 * fails is discarded on the server (when it got that far) and marked
 * failed; the next file still goes, unless the refusal holds for the whole
 * batch (`BATCH_ENDING_CODES`): then the run stops, the rest stay waiting,
 * and the refusal is `state.error`. Last, the batch is finished — exactly
 * once per run, whatever happened — and the server's answer is kept as
 * `result`.
 *
 * `cancel()` (or unmounting) stops the current step, discards that file's
 * item, leaves the files not yet sent `waiting`, and still finishes the
 * batch with what is ready. Once a run has finished, `retryUnsent()` sends
 * every file that did not upload — failed, or left waiting by a cancel or a
 * batch-wide refusal — in one new batch with the same settings, those with
 * prepared output kept (`PreparedCache`) first, so they are not prepared
 * again. `dropFailed()` forgets the failed files. One run at a time: `start`
 * while running does nothing.
 */
export function useGalleryUpload(slug: string) {
  const utils = api.useUtils();
  const startBatch = api.gallery.startBatch.useMutation();
  const startItem = api.gallery.startItem.useMutation();
  const finishItem = api.gallery.finishItem.useMutation();
  const discardItem = api.gallery.discardItem.useMutation();
  const finishBatch = api.gallery.finishBatch.useMutation();

  const [state, setState] = useState<GalleryUploadState>(INITIAL_STATE);
  /**
   * The state as of the latest change, which React's `state` mirrors. Every
   * change goes through `commit`, so reads here are never a stale render's.
   */
  const latest = useRef<GalleryUploadState>(INITIAL_STATE);
  const inFlight = useRef<AbortController | null>(null);
  const picked = useRef(new Map<string, File>());
  const prepared = useRef(new PreparedCache());
  const settingsRef = useRef<GalleryBatchSettings | null>(null);
  const nextId = useRef(0);

  // Leaving the page stops the current file; the run still settles the batch.
  useEffect(() => () => inFlight.current?.abort(), []);

  function commit(
    change: (current: GalleryUploadState) => GalleryUploadState,
  ): void {
    latest.current = change(latest.current);
    setState(latest.current);
  }

  function updateFiles(
    ids: Iterable<string>,
    patch: Partial<GalleryUploadFile>,
  ): void {
    const changing = new Set(ids);
    commit((current) => ({
      ...current,
      files: current.files.map((file) =>
        changing.has(file.id) ? { ...file, ...patch } : file,
      ),
    }));
  }

  function updateFile(id: string, patch: Partial<GalleryUploadFile>): void {
    updateFiles([id], patch);
  }

  async function prepare(
    entry: GalleryUploadFile,
    file: File,
    signal: AbortSignal,
  ): Promise<PreparedFile> {
    const cached = prepared.current.get(entry.id);
    if (cached) return cached;
    updateFile(entry.id, { phase: "preparing", progress: 0 });
    let output: PreparedFile;
    if (entry.mediaType === "photo") {
      const photo = await prepareGalleryPhoto(file);
      output = { ...photo, mediaType: "photo", blob: photo.file };
    } else {
      if (!(await canTranscode())) throw new CannotConvertHereError();
      signal.throwIfAborted();
      const clip = await transcodeForUpload(file, {
        signal,
        onProgress: (share) => updateFile(entry.id, { progress: share }),
      });
      output = { ...clip, mediaType: "video", blob: clip.video };
    }
    prepared.current.keep(entry.id, output);
    return output;
  }

  /** Prepares, sends and finishes one file. Throws on any failure. */
  async function sendFile(
    entry: GalleryUploadFile,
    batchId: number,
    signal: AbortSignal,
  ): Promise<void> {
    const { id, mediaType } = entry;
    const file = picked.current.get(id);
    if (!file) throw new Error("unknown file");
    const ready = await prepare(entry, file, signal);
    signal.throwIfAborted();

    updateFile(id, { phase: "uploading", progress: 0 });
    const { itemId, ...grants } = await startItem.mutateAsync({
      batchId,
      mediaType,
      contentType: ready.blob.type,
      bytes: ready.blob.size,
      thumbnailBytes: ready.thumbnail.size,
      width: ready.width,
      height: ready.height,
      ...(mediaType === "video" && { durationSeconds: ready.durationSeconds }),
    });
    try {
      // A cancel while the grant was on its way still discards the item.
      signal.throwIfAborted();
      const total = ready.blob.size + ready.thumbnail.size;
      await uploadToGrant(
        grants.file,
        ready.blob,
        (share) =>
          updateFile(id, { progress: (share * ready.blob.size) / total }),
        signal,
      );
      await uploadToGrant(
        grants.thumbnail,
        ready.thumbnail,
        (share) =>
          updateFile(id, {
            progress: (ready.blob.size + share * ready.thumbnail.size) / total,
          }),
        signal,
      );
      await finishItem.mutateAsync({ itemId });
    } catch (error) {
      // Discard changes nothing unless the item is still uploading, so it is
      // safe after a finish the server did settle. Its own failure changes
      // nothing here: the daily cleanup removes what it leaves.
      await discardItem.mutateAsync({ itemId }).catch(() => undefined);
      throw error;
    }
    prepared.current.forget(id);
    updateFile(id, { phase: "done", progress: 1 });
  }

  /** One batch: start it, send `entries` in order, finish it. */
  async function run(
    entries: GalleryUploadFile[],
    settings: GalleryBatchSettings,
  ): Promise<void> {
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    const ids = entries.map((entry) => entry.id);
    const sending = new Set(ids);
    commit((current) => ({
      phase: "running",
      result: null,
      files: current.files.map((file) =>
        sending.has(file.id)
          ? { ...file, phase: "waiting", progress: 0, error: undefined }
          : file,
      ),
    }));
    try {
      let batchId: number;
      try {
        ({ batchId } = await startBatch.mutateAsync({
          slug,
          ...settings,
          plannedFiles: entries.length,
          plannedVideos: entries.filter((entry) => entry.mediaType === "video")
            .length,
        }));
      } catch (error) {
        const code = errorCodeFor(error);
        updateFiles(ids, { phase: "failed", progress: 0, error: code });
        commit((current) => ({ ...current, phase: "finished", error: code }));
        return;
      }

      let endedBy: GalleryUploadErrorCode | null = null;
      /** Where the run stopped early; files from here on stay waiting. */
      let stoppedAt = entries.length;
      for (const [index, entry] of entries.entries()) {
        if (signal.aborted) {
          stoppedAt = index;
          break;
        }
        try {
          await sendFile(entry, batchId, signal);
        } catch (error) {
          if (signal.aborted) {
            stoppedAt = index;
            break;
          }
          const code = errorCodeFor(error);
          if (RETRY_FUTILE_CODES.has(code)) prepared.current.forget(entry.id);
          updateFile(entry.id, { phase: "failed", progress: 0, error: code });
          if (BATCH_ENDING_CODES.has(code)) {
            endedBy = code;
            stoppedAt = index + 1;
            break;
          }
        }
      }
      // Files left unsent keep nothing in memory; a new start prepares them.
      const unsent = ids.slice(stoppedAt);
      for (const id of unsent) prepared.current.forget(id);
      updateFiles(unsent, { phase: "waiting", progress: 0 });

      try {
        const result = await finishBatch.mutateAsync({ batchId });
        commit((current) => ({
          ...current,
          phase: "finished",
          result,
          error: endedBy ?? undefined,
        }));
        if (result.readyCount > 0) {
          void utils.gallery.list.invalidate({ slug });
          void utils.gallery.facets.invalidate({ slug });
        }
      } catch (error) {
        commit((current) => ({
          ...current,
          phase: "finished",
          // A batch-wide refusal says more than the failed finish; keep it.
          error: endedBy ?? errorCodeFor(error),
        }));
      }
    } finally {
      inFlight.current = null;
    }
  }

  async function start(
    files: File[],
    settings: GalleryBatchSettings,
  ): Promise<void> {
    if (inFlight.current || files.length === 0) return;
    picked.current.clear();
    prepared.current.clear();
    settingsRef.current = settings;
    const entries: GalleryUploadFile[] = files.map((file) => {
      const id = String(++nextId.current);
      picked.current.set(id, file);
      return {
        id,
        name: file.name,
        mediaType: galleryMediaTypeOf(file),
        phase: "waiting",
        progress: 0,
      };
    });
    commit(() => ({ phase: "idle", files: entries, result: null }));
    await run(entries, settings);
  }

  async function retryUnsent(): Promise<void> {
    const settings = settingsRef.current;
    const current = latest.current;
    if (inFlight.current || !settings || current.phase !== "finished") return;
    const unsent = current.files.filter((file) => file.phase !== "done");
    if (unsent.length === 0) return;
    // Files already prepared go first, so the kept clip is sent before
    // converting another one would push it out of the cache.
    const kept = unsent.filter((file) => prepared.current.has(file.id));
    const rest = unsent.filter((file) => !prepared.current.has(file.id));
    await run([...kept, ...rest], settings);
  }

  function dropFailed(): void {
    if (inFlight.current) return;
    for (const file of latest.current.files) {
      if (file.phase !== "failed") continue;
      picked.current.delete(file.id);
      prepared.current.forget(file.id);
    }
    commit((current) => ({
      ...current,
      files: current.files.filter((file) => file.phase !== "failed"),
    }));
  }

  return {
    state,
    start,
    cancel: () => inFlight.current?.abort(),
    retryUnsent,
    dropFailed,
  };
}
