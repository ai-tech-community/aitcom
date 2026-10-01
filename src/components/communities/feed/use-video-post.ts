"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  MAX_VIDEO_SECONDS,
  UPLOAD_GRANT_SECONDS,
  type VideoVisibility,
} from "@/lib/video-rules";
import {
  UnsupportedVideoError,
  VideoTooLongError,
  canTranscode,
  readVideoDuration,
  transcodeForUpload,
  type TranscodeResult,
} from "@/lib/video-transcode";
import { api } from "@/trpc/react";
import { uploadToGrant, type UploadGrant } from "@/lib/upload-to-grant";

export type VideoPostState =
  | { step: "idle" }
  | { step: "preparing" | "uploading"; share: number }
  | { step: "posting" }
  /** `retryable`: trying the same clip again may work (a network failure). */
  | { step: "error"; message: string; retryable: boolean };

export type VideoPostInput = {
  file: File;
  caption: string;
  /** Ids of the members the caption mentions. */
  mentions?: string[];
  visibility: VideoVisibility;
} & (
  | { topicSlug: string }
  /** Put the video on this existing post (an edit) instead of a new post. */
  | {
      replacePostId: number;
      /** Topic and preview changes made in the same edit. */
      details?: { topicSlug?: string; linkPreviewHidden?: boolean };
    }
);

type VideoUploadGrant = {
  uploadId: string;
  video: UploadGrant;
  thumbnail: UploadGrant;
};

/**
 * A grant is reused on retry only while it has at least this long left, so
 * the re-sent files still arrive before S3 stops accepting them.
 */
const GRANT_REUSE_MARGIN_MS = 60_000;

/** The converted clip, kept so a retry skips the slow conversion. */
type PreparedCache = { file: File; output: TranscodeResult };
/** The last upload grant, kept so a retry re-sends to the same place. */
type GrantCache = {
  file: File;
  visibility: VideoVisibility;
  grant: VideoUploadGrant;
  issuedAt: number;
};

function isGrantFresh(cached: GrantCache): boolean {
  const age = Date.now() - cached.issuedAt;
  return age < UPLOAD_GRANT_SECONDS * 1000 - GRANT_REUSE_MARGIN_MS;
}

/** The browser has no H.264 encoder, so nothing was tried. */
class CannotConvertHereError extends Error {}

/**
 * Posts a video: prepare it on the device, upload the thumbnail and the video
 * straight to S3 with one-time grants, then create the post — or, with
 * `replacePostId`, put it on that existing post (an edit).
 *
 * Only one post runs at a time; a second call while one is in flight returns
 * false without doing anything. `cancel()` stops preparing or uploading and
 * returns to idle with no error.
 *
 * Retrying the same clip picks up where it can: the converted clip is kept
 * (per File), and the upload grant is reused while it is still valid for the
 * same visibility. A cancel keeps the converted clip but drops the grant; a
 * failure while creating the post drops the grant (the server may have used
 * or removed it). `reset()` forgets both, for a removed or replaced clip.
 *
 * `check(file)` runs the quick checks (can this browser convert, can the file
 * be read, is it short enough) as soon as a clip is picked, so a clip that
 * cannot work is refused before the member writes a caption. `post()` runs
 * the same checks again as it converts.
 */
export function useVideoPost(slug: string) {
  const t = useTranslations("communities.video");
  const utils = api.useUtils();
  const [state, setState] = useState<VideoPostState>({ step: "idle" });
  const inFlight = useRef<AbortController | null>(null);
  const preparedCache = useRef<PreparedCache | null>(null);
  const grantCache = useRef<GrantCache | null>(null);
  /** The clip whose pick-time check may still report; null once superseded. */
  const checking = useRef<File | null>(null);
  const createUpload = api.feed.createVideoUpload.useMutation();
  const finish = api.feed.finishVideoPost.useMutation();
  const replace = api.feed.replacePostVideo.useMutation();

  function messageFor(error: unknown): string {
    if (error instanceof CannotConvertHereError) return t("unsupported");
    if (error instanceof VideoTooLongError) return t("tooLong");
    if (error instanceof UnsupportedVideoError) return t("unreadable");
    const code = (error as { data?: { code?: string } } | null)?.data?.code;
    if (code === "TOO_MANY_REQUESTS") return t("limit");
    return t("failed");
  }

  function isRetryable(error: unknown): boolean {
    if (
      error instanceof CannotConvertHereError ||
      error instanceof VideoTooLongError ||
      error instanceof UnsupportedVideoError
    ) {
      return false;
    }
    const code = (error as { data?: { code?: string } } | null)?.data?.code;
    return code !== "TOO_MANY_REQUESTS";
  }

  async function prepare(
    file: File,
    signal: AbortSignal,
  ): Promise<TranscodeResult> {
    const cached = preparedCache.current;
    if (cached?.file === file) return cached.output;
    preparedCache.current = null;
    grantCache.current = null;
    if (!(await canTranscode())) throw new CannotConvertHereError();
    signal.throwIfAborted();
    setState({ step: "preparing", share: 0 });
    const output = await transcodeForUpload(file, {
      signal,
      onProgress: (share) => setState({ step: "preparing", share }),
    });
    preparedCache.current = { file, output };
    return output;
  }

  async function grantFor(input: VideoPostInput): Promise<VideoUploadGrant> {
    const cached = grantCache.current;
    if (
      cached?.file === input.file &&
      cached.visibility === input.visibility &&
      isGrantFresh(cached)
    ) {
      return cached.grant;
    }
    grantCache.current = null;
    const grant = await createUpload.mutateAsync({
      communitySlug: slug,
      visibility: input.visibility,
    });
    grantCache.current = {
      file: input.file,
      visibility: input.visibility,
      grant,
      issuedAt: Date.now(),
    };
    return grant;
  }

  async function check(file: File): Promise<void> {
    checking.current = file;
    let problem: Error | null = null;
    try {
      if (!(await canTranscode())) problem = new CannotConvertHereError();
      else if ((await readVideoDuration(file)) > MAX_VIDEO_SECONDS) {
        problem = new VideoTooLongError();
      }
    } catch (error) {
      problem =
        error instanceof Error
          ? error
          : new UnsupportedVideoError(String(error));
    }
    // A removed or replaced clip, or a post already underway, wins.
    if (checking.current !== file) return;
    checking.current = null;
    if (problem) {
      setState({
        step: "error",
        message: messageFor(problem),
        retryable: false,
      });
    }
  }

  async function post(input: VideoPostInput): Promise<boolean> {
    if (inFlight.current) return false;
    checking.current = null;
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    try {
      const prepared = await prepare(input.file, signal);
      signal.throwIfAborted();

      setState({ step: "uploading", share: 0 });
      const grant = await grantFor(input);
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
      try {
        const uploaded = {
          communitySlug: slug,
          uploadId: grant.uploadId,
          caption: input.caption,
          mentions: input.mentions,
          durationSeconds: prepared.durationSeconds,
          width: prepared.width,
          height: prepared.height,
        };
        if ("replacePostId" in input) {
          await replace.mutateAsync({
            ...uploaded,
            postId: input.replacePostId,
            ...input.details,
          });
        } else {
          await finish.mutateAsync({ ...uploaded, topicSlug: input.topicSlug });
        }
      } catch (error) {
        grantCache.current = null;
        throw error;
      }
      preparedCache.current = null;
      grantCache.current = null;
      void utils.feed.getActivity.invalidate({ communitySlug: slug });
      void utils.feed.getFeed.invalidate();
      void utils.feed.getReels.invalidate({ communitySlug: slug });
      setState({ step: "idle" });
      return true;
    } catch (error) {
      if (signal.aborted) {
        grantCache.current = null;
        setState({ step: "idle" });
      } else {
        setState({
          step: "error",
          message: messageFor(error),
          retryable: isRetryable(error),
        });
      }
      return false;
    } finally {
      inFlight.current = null;
    }
  }

  return {
    state,
    post,
    cancel: () => inFlight.current?.abort(),
    check,
    reset: () => {
      checking.current = null;
      preparedCache.current = null;
      grantCache.current = null;
      setState({ step: "idle" });
    },
  };
}
