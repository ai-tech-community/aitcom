"use client";

import { useEffect, useRef } from "react";

import { api } from "@/trpc/react";
import {
  startActiveReadingTime,
  type ReadingSession,
} from "./active-reading-time";

/** Reading is never interrupted by a failed tally. No visible content. */
export function ReadTracker({
  issueId,
  articleId,
  trackEnd,
  enabled,
}: {
  issueId: number;
  articleId?: number;
  trackEnd: boolean;
  enabled: boolean;
}) {
  const record = api.magazineStats.record.useMutation();
  // The mutate function stays stable when the mutation result object changes.
  const { mutate } = record;
  const viewed = useRef(false);
  const ended = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const readingSession = useRef<(ReadingSession & { page: string }) | null>(
    null,
  );

  useEffect(() => {
    if (!enabled || typeof crypto.randomUUID !== "function") return;
    const page = `${issueId}:${articleId ?? "issue"}`;
    if (readingSession.current?.page !== page) {
      readingSession.current = { id: crypto.randomUUID(), activeMs: 0, page };
    }
    return startActiveReadingTime(
      { issueId, ...(articleId === undefined ? {} : { articleId }) },
      readingSession.current,
    );
  }, [enabled, issueId, articleId]);

  useEffect(() => {
    if (!enabled || viewed.current) return;
    viewed.current = true;
    mutate(
      {
        issueId,
        ...(articleId === undefined ? {} : { articleId }),
        event: "view",
      },
      { onError: () => undefined },
    );
  }, [enabled, issueId, articleId, mutate]);

  useEffect(() => {
    if (
      !enabled ||
      !trackEnd ||
      !sentinel.current ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver((entries) => {
      if (ended.current || !entries.some((entry) => entry.isIntersecting))
        return;
      ended.current = true;
      observer.disconnect();
      mutate(
        {
          issueId,
          ...(articleId === undefined ? {} : { articleId }),
          event: "read_end",
        },
        { onError: () => undefined },
      );
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [enabled, trackEnd, issueId, articleId, mutate]);

  return enabled && trackEnd ? (
    <div ref={sentinel} aria-hidden="true" className="h-px" />
  ) : null;
}
