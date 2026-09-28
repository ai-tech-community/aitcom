"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { uploadToGrant } from "@/lib/upload-to-grant";
import { api } from "@/trpc/react";

export type FileUploadState =
  | { step: "idle" }
  | { step: "uploading"; share: number }
  | { step: "finishing" }
  | { step: "error"; message: string };

/** Server refusal codes (TRPCError messages) → keys under classroom.files. */
const MESSAGE_KEYS: Record<string, string> = {
  FILE_TYPE_NOT_ALLOWED: "errorType",
  FILE_EMPTY: "errorEmpty",
  FILE_TOO_LARGE: "errorTooLarge",
  STORAGE_FULL: "errorStorageFull",
  UPLOADS_NOT_ALLOWED: "errorNotAllowed",
  UPLOAD_LIMIT: "errorDailyLimit",
};

/**
 * Uploads one lesson file: ask the server for a grant (it checks policy,
 * type, size and storage), POST the file straight to S3 with the type the
 * server chose, then ask the server to check what arrived.
 *
 * One upload at a time. `cancel()` stops the transfer and returns to idle;
 * so does unmounting the component that owns the hook. Whenever an attempt
 * fails or is cancelled after the server recorded it — finish failing
 * included — the upload is discarded (`discardUpload`), so it stops counting
 * against the community's storage; the daily cleanup removes the record
 * later. Discard changes nothing unless the record is still uploading, so it
 * is safe after a finish the server did settle.
 */
export function useFileUpload(courseId: number | null) {
  const t = useTranslations("classroom.files");
  const utils = api.useUtils();
  const start = api.classroomMaterials.startFileUpload.useMutation();
  const finish = api.classroomMaterials.finishFileUpload.useMutation();
  const discard = api.classroomMaterials.discardUpload.useMutation();
  const [state, setState] = useState<FileUploadState>({ step: "idle" });
  const inFlight = useRef<AbortController | null>(null);

  // Removing the file block (or leaving the editor) stops its upload.
  useEffect(() => () => inFlight.current?.abort(), []);

  function messageFor(error: unknown): string {
    const code = (error as { message?: unknown } | null)?.message;
    const key = typeof code === "string" ? MESSAGE_KEYS[code] : undefined;
    return t(key ?? "errorFailed");
  }

  async function upload(file: File): Promise<{ id: number } | null> {
    if (courseId === null || inFlight.current) return null;
    const controller = new AbortController();
    inFlight.current = controller;
    let materialId: number | null = null;
    try {
      setState({ step: "uploading", share: 0 });
      const grant = await start.mutateAsync({
        courseId,
        fileName: file.name,
        bytes: file.size,
      });
      materialId = grant.materialId;
      await uploadToGrant(
        grant.upload,
        file.slice(0, file.size, grant.contentType),
        (share) => setState({ step: "uploading", share }),
        controller.signal,
      );
      setState({ step: "finishing" });
      const done = await finish.mutateAsync({ materialId: grant.materialId });
      void utils.classroomMaterials.listCourseMaterials.invalidate({
        courseId,
      });
      setState({ step: "idle" });
      return { id: done.id };
    } catch (error) {
      if (materialId !== null) {
        void discard.mutateAsync({ materialId }).catch(() => undefined);
      }
      setState(
        controller.signal.aborted
          ? { step: "idle" }
          : { step: "error", message: messageFor(error) },
      );
      return null;
    } finally {
      inFlight.current = null;
    }
  }

  return { state, upload, cancel: () => inFlight.current?.abort() };
}
