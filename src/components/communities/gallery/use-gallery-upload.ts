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
  blob: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
  durationSeconds?: number;
};

/**
 * Refusals that hold for every remaining file of the batch: the batch's
 * window closed, the member left, or the gallery was switched off. The rest
 * are not tried (converting a clip only to be refused wastes minutes).
 */
const BATCH_ENDING_CODES: ReadonlySet<GalleryUploadErrorCode> = new Set([
  "UPLOAD_EXPIRED",
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

/**
 * Uploads a batch of photos and videos to a community's gallery (spec
 * 2026-11-13, Upload flow). `start` opens one batch on the server, then
 * takes the files one at a time, in order — so a phone holds one converted
 * clip in memory and each ten-minute grant is asked for only when its file
 * is ready: prepare (shrink the photo or convert the clip) → `startItem` →
 * send the file and its thumbnail straight to S3 → `finishItem`. A file that
 * fails is discarded on the server (when it got that far) and marked failed;
 * the next file still goes. Last, the batch is finished — exactly once per
 * run, whatever happened — and the server's answer is kept as `result`.
 *
 * `cancel()` (or unmounting) stops the current step, discards that file's
 * item, leaves the files not yet sent `waiting`, and still finishes the
 * batch with what is ready. `retryFailed()` sends the failed files again in
 * a new batch with the same settings, reusing what was already prepared;
 * `dropFailed()` forgets them. One run at a time: `start` while running does
 * nothing.
 */
export function useGalleryUpload(slug: string) {
  const utils = api.useUtils();
  const startBatch = api.gallery.startBatch.useMutation();
  const startItem = api.gallery.startItem.useMutation();
  const finishItem = api.gallery.finishItem.useMutation();
  const discardItem = api.gallery.discardItem.useMutation();
  const finishBatch = api.gallery.finishBatch.useMutation();

  const [state, setState] = useState<GalleryUploadState>({
    phase: "idle",
    files: [],
    result: null,
  });
  const inFlight = useRef<AbortController | null>(null);
  const picked = useRef(new Map<string, File>());
  /** Kept for files that failed after preparing, so a retry skips it. */
  const prepared = useRef(new Map<string, PreparedFile>());
  const settingsRef = useRef<GalleryBatchSettings | null>(null);
  const nextId = useRef(0);

  // Leaving the page stops the current file; the run still settles the batch.
  useEffect(() => () => inFlight.current?.abort(), []);

  function updateFile(id: string, patch: Partial<GalleryUploadFile>): void {
    setState((current) => ({
      ...current,
      files: current.files.map((file) =>
        file.id === id ? { ...file, ...patch } : file,
      ),
    }));
  }

  function failFiles(ids: string[], error: GalleryUploadErrorCode): void {
    const failing = new Set(ids);
    setState((current) => ({
      ...current,
      files: current.files.map((file) =>
        failing.has(file.id)
          ? { ...file, phase: "failed", progress: 0, error }
          : file,
      ),
    }));
  }

  async function prepare(
    id: string,
    file: File,
    signal: AbortSignal,
  ): Promise<PreparedFile> {
    const cached = prepared.current.get(id);
    if (cached) return cached;
    updateFile(id, { phase: "preparing", progress: 0 });
    let output: PreparedFile;
    if (galleryMediaTypeOf(file) === "photo") {
      const photo = await prepareGalleryPhoto(file);
      output = { ...photo, blob: photo.file };
    } else {
      if (!(await canTranscode())) throw new CannotConvertHereError();
      signal.throwIfAborted();
      const clip = await transcodeForUpload(file, {
        signal,
        onProgress: (share) => updateFile(id, { progress: share }),
      });
      output = { ...clip, blob: clip.video };
    }
    prepared.current.set(id, output);
    return output;
  }

  /** Prepares, sends and finishes one file. Throws on any failure. */
  async function sendFile(
    id: string,
    batchId: number,
    signal: AbortSignal,
  ): Promise<void> {
    const file = picked.current.get(id);
    if (!file) throw new Error("unknown file");
    const mediaType = galleryMediaTypeOf(file);
    const ready = await prepare(id, file, signal);
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
    prepared.current.delete(id);
    updateFile(id, { phase: "done", progress: 1 });
  }

  /** One batch: start it, send `ids` in order, finish it. */
  async function run(
    ids: string[],
    settings: GalleryBatchSettings,
  ): Promise<void> {
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    const sending = new Set(ids);
    setState((current) => ({
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
        const plannedVideos = ids.filter(
          (id) => mediaTypeOfId(id) === "video",
        ).length;
        ({ batchId } = await startBatch.mutateAsync({
          slug,
          ...settings,
          plannedFiles: ids.length,
          plannedVideos,
        }));
      } catch (error) {
        const code = errorCodeFor(error);
        failFiles(ids, code);
        setState((current) => ({ ...current, phase: "finished", error: code }));
        return;
      }

      let endedBy: GalleryUploadErrorCode | null = null;
      for (const [index, id] of ids.entries()) {
        if (signal.aborted) break;
        try {
          await sendFile(id, batchId, signal);
        } catch (error) {
          if (signal.aborted) {
            updateFile(id, { phase: "waiting", progress: 0 });
            break;
          }
          const code = errorCodeFor(error);
          if (BATCH_ENDING_CODES.has(code)) {
            endedBy = code;
            failFiles(ids.slice(index), code);
            break;
          }
          updateFile(id, { phase: "failed", progress: 0, error: code });
        }
      }

      try {
        const result = await finishBatch.mutateAsync({ batchId });
        setState((current) => ({ ...current, phase: "finished", result }));
        if (result.readyCount > 0) {
          void utils.gallery.list.invalidate({ slug });
          void utils.gallery.facets.invalidate({ slug });
        }
      } catch (error) {
        setState((current) => ({
          ...current,
          phase: "finished",
          // A batch-wide refusal already explains every file; keep that one.
          error: endedBy ?? errorCodeFor(error),
        }));
      }
    } finally {
      inFlight.current = null;
    }
  }

  function mediaTypeOfId(id: string): GalleryMediaType {
    const file = picked.current.get(id);
    return file ? galleryMediaTypeOf(file) : "photo";
  }

  async function start(
    files: File[],
    settings: GalleryBatchSettings,
  ): Promise<void> {
    if (inFlight.current || files.length === 0) return;
    picked.current.clear();
    prepared.current.clear();
    settingsRef.current = settings;
    const entries = files.map((file) => {
      const id = String(++nextId.current);
      picked.current.set(id, file);
      return {
        id,
        name: file.name,
        mediaType: galleryMediaTypeOf(file),
        phase: "waiting" as const,
        progress: 0,
      };
    });
    setState({ phase: "idle", files: entries, result: null });
    await run(
      entries.map((entry) => entry.id),
      settings,
    );
  }

  async function retryFailed(): Promise<void> {
    const settings = settingsRef.current;
    if (inFlight.current || !settings) return;
    const ids = state.files
      .filter((file) => file.phase === "failed")
      .map((file) => file.id);
    if (ids.length === 0) return;
    await run(ids, settings);
  }

  function dropFailed(): void {
    if (inFlight.current) return;
    const failed = state.files.filter((file) => file.phase === "failed");
    for (const file of failed) {
      picked.current.delete(file.id);
      prepared.current.delete(file.id);
    }
    setState((current) => ({
      ...current,
      files: current.files.filter((file) => file.phase !== "failed"),
    }));
  }

  return {
    state,
    start,
    cancel: () => inFlight.current?.abort(),
    retryFailed,
    dropFailed,
  };
}
