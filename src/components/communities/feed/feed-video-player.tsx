"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The playable part of a feed post, as the feed API sends it. */
export type FeedVideo = {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  visibility: "community" | "public";
};

/** Share of the player that must be on screen before it starts by itself. */
const AUTOPLAY_RATIO = 0.6;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Inline feed video.
 *
 * - Starts muted once 60% of it is on screen and pauses when scrolled away.
 * - Under `prefers-reduced-motion` it never starts by itself: the thumbnail
 *   shows with a play button, which comes back whenever the video is paused
 *   (for example after scrolling away and back).
 * - A labelled play/pause button (WCAG 2.2.2) and a sound button are always
 *   focusable and show on hover and keyboard focus (and always on touch
 *   screens). Once the viewer pauses, scrolling back does not restart it.
 * - Tapping the video toggles sound.
 * - A private playback link expires after an hour. On a load error the player
 *   asks the caller once for a fresh link through `onExpired`; a second error
 *   in a row shows "Video unavailable".
 */
export function FeedVideoPlayer({
  video,
  onExpired,
  className,
}: {
  video: FeedVideo;
  onExpired?: () => void;
  className?: string;
}) {
  const t = useTranslations("communities.report");
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const askedForFreshLink = useRef(false);
  /** The viewer paused on purpose, so scrolling back must not restart it. */
  const pausedByViewer = useRef(false);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    setReduced(reduce);
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio < AUTOPLAY_RATIO) el.pause();
        else if (!reduce && !pausedByViewer.current) {
          void el.play()?.catch(() => undefined);
        }
      },
      { threshold: [0, AUTOPLAY_RATIO, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // React does not reliably keep the `muted` DOM property in sync with the
  // attribute, so set the property directly.
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  const failed = failedUrl === video.url;
  const ratio =
    video.width > 0 && video.height > 0 ? video.width / video.height : 9 / 16;

  function togglePlay() {
    const el = ref.current;
    if (!el) return;
    if (playing) {
      pausedByViewer.current = true;
      el.pause();
    } else {
      pausedByViewer.current = false;
      void el.play()?.catch(() => undefined);
    }
  }

  // Controls show on hover and keyboard focus, and always on touch screens.
  const revealOnHover =
    "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100";
  // Under reduced motion a paused video shows a large, always-visible Play.
  const bigPlay = reduced && !playing;

  function handleError() {
    if (!askedForFreshLink.current && onExpired) {
      askedForFreshLink.current = true;
      onExpired();
      return;
    }
    setFailedUrl(video.url);
  }

  return (
    <div
      className={cn(
        "group bg-muted relative mx-auto w-full max-w-sm overflow-hidden rounded-lg",
        className,
      )}
      style={{ aspectRatio: String(ratio) }}
    >
      {/* Tap-to-toggle-sound is a pointer shortcut; keyboard users get the
          labelled sound button below. */}
      <video
        ref={ref}
        src={video.url}
        poster={video.thumbnailUrl}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedData={() => {
          askedForFreshLink.current = false;
        }}
        onError={handleError}
        onClick={() => setMuted((value) => !value)}
        className="size-full cursor-pointer object-cover"
      />
      {failed ? (
        <p
          role="status"
          className="bg-background/80 text-foreground absolute inset-0 flex items-center justify-center text-sm"
        >
          {t("unavailable")}
        </p>
      ) : null}
      {failed ? null : (
        <Button
          type="button"
          variant="secondary"
          size={bigPlay ? "icon" : "icon-sm"}
          className={cn(
            "absolute rounded-full",
            bigPlay
              ? "inset-0 m-auto size-12"
              : cn("bottom-2 left-2", revealOnHover),
          )}
          aria-label={playing ? t("pause") : t("play")}
          onClick={togglePlay}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
      )}
      {failed ? null : (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className={cn(
            "absolute right-2 bottom-2 rounded-full",
            revealOnHover,
          )}
          aria-label={muted ? t("unmute") : t("mute")}
          onClick={() => setMuted((value) => !value)}
        >
          {muted ? (
            <VolumeX aria-hidden="true" />
          ) : (
            <Volume2 aria-hidden="true" />
          )}
        </Button>
      )}
    </div>
  );
}
