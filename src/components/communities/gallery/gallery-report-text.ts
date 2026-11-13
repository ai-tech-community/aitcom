"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import type { GalleryReportReason } from "@/lib/gallery-report-reasons";

/**
 * The words for a gallery report's reason. The reasons a gallery item
 * shares with a feed post use the feed's words; only "This is me" has its
 * own, under `gallery.report`.
 */
export function useGalleryReportReasonLabel() {
  const feed = useTranslations("communities.report");
  const gallery = useTranslations("gallery.report");
  return useCallback(
    (reason: GalleryReportReason): string =>
      reason === "this_is_me" ? gallery("this_is_me") : feed(reason),
    [feed, gallery],
  );
}
