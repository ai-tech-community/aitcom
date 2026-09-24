"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { VideoVisibility } from "@/lib/video-rules";
import {
  UnsupportedVideoError,
  VideoTooLongError,
  canTranscode,
  transcodeForUpload,
} from "@/lib/video-transcode";
import { api } from "@/trpc/react";

export type VideoPostState =
  | { step: "idle" }
  | { step: "preparing" | "uploading"; share: number }
  | { step: "posting" }
  | { step: "error"; message: string };

export type VideoPostInput = {
  file: File;
  caption: string;
  visibility: VideoVisibility;
  topicSlug: string;
};

type UploadGrant = { url: string; fields: Record<string, string> };

/** The browser has no H.264 encoder, so nothing was tried. */
class CannotConvertHereError extends Error {}

/** The abort reason as an Error (it is an `AbortError` unless one was given). */
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The upload was cancelled.", "AbortError");
}

/**
 * POSTs a blob to a presigned S3 form. Uses XHR because fetch has no upload
 * progress. Settles on success, HTTP failure, network failure, or abort.
 */
function uploadToGrant(
  grant: UploadGrant,
  blob: Blob,
  onProgress: (share: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(grant.fields)) {
      form.append(name, value);
    }
    form.append("file", blob); // S3 requires the file field last.

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = (error?: Error) => {
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    xhr.open("POST", grant.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? settle()
        : settle(new Error(`upload failed with HTTP ${xhr.status}`));
    xhr.onerror = () => settle(new Error("upload network error"));
    xhr.onabort = () => settle(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(form);
  });
}

/**
 * Posts a video: prepare it on the device, upload the thumbnail and the video
 * straight to S3 with one-time grants, then create the post.
 *
 * Only one post runs at a time; a second call while one is in flight returns
 * false without doing anything. `cancel()` stops preparing or uploading and
 * returns to idle with no error.
 */
export function useVideoPost(slug: string) {
  const t = useTranslations("communities.video");
  const utils = api.useUtils();
  const [state, setState] = useState<VideoPostState>({ step: "idle" });
  const inFlight = useRef<AbortController | null>(null);
  const createUpload = api.feed.createVideoUpload.useMutation();
  const finish = api.feed.finishVideoPost.useMutation();

  function messageFor(error: unknown): string {
    if (error instanceof CannotConvertHereError) return t("unsupported");
    if (error instanceof VideoTooLongError) return t("tooLong");
    if (error instanceof UnsupportedVideoError) return t("unreadable");
    const code = (error as { data?: { code?: string } } | null)?.data?.code;
    if (code === "TOO_MANY_REQUESTS") return t("limit");
    return t("failed");
  }

  async function post(input: VideoPostInput): Promise<boolean> {
    if (inFlight.current) return false;
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    try {
      if (!(await canTranscode())) throw new CannotConvertHereError();
      signal.throwIfAborted();

      setState({ step: "preparing", share: 0 });
      const prepared = await transcodeForUpload(input.file, {
        signal,
        onProgress: (share) => setState({ step: "preparing", share }),
      });

      setState({ step: "uploading", share: 0 });
      const grant = await createUpload.mutateAsync({
        communitySlug: slug,
        visibility: input.visibility,
      });
      await uploadToGrant(
        grant.thumbnail,
        prepared.thumbnail,
        () => undefined,
        signal,
      );
      await uploadToGrant(
        grant.video,
        prepared.video,
        (share) => setState({ step: "uploading", share }),
        signal,
      );
      signal.throwIfAborted();

      setState({ step: "posting" });
      await finish.mutateAsync({
        communitySlug: slug,
        uploadId: grant.uploadId,
        caption: input.caption,
        topicSlug: input.topicSlug,
        durationSeconds: prepared.durationSeconds,
        width: prepared.width,
        height: prepared.height,
      });
      void utils.feed.getActivity.invalidate({ communitySlug: slug });
      void utils.feed.getFeed.invalidate();
      void utils.feed.getReels.invalidate({ communitySlug: slug });
      setState({ step: "idle" });
      return true;
    } catch (error) {
      setState(
        signal.aborted
          ? { step: "idle" }
          : { step: "error", message: messageFor(error) },
      );
      return false;
    } finally {
      inFlight.current = null;
    }
  }

  return {
    state,
    post,
    cancel: () => inFlight.current?.abort(),
    reset: () => setState({ step: "idle" }),
  };
}
