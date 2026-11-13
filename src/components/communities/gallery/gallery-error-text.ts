"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { isGalleryErrorCode } from "@/lib/gallery-rules";

type ErrorLike = { message?: unknown; data?: { code?: unknown } | null };

/**
 * Turns a failed gallery call into translated copy. The server answers with
 * stable codes (`NOT_ALLOWED`, …) or tRPC's `NOT_FOUND`; a code with copy in
 * `gallery.errors` gets it, anything else gets `fallback`. The raw message
 * is never shown (DESIGN.md Gate-Before-Fail: no raw `error.message`).
 */
export function useGalleryErrorText() {
  const t = useTranslations("gallery.errors");
  return useCallback(
    (error: unknown, fallback: string) => {
      const { message, data } = (error ?? {}) as ErrorLike;
      if (isGalleryErrorCode(message) && t.has(message)) return t(message);
      if (data?.code === "NOT_FOUND") return t("NOT_FOUND");
      return t(fallback);
    },
    [t],
  );
}
