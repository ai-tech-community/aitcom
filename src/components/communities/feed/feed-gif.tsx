"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImageOff, Pause, Play } from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";

export type FeedGifView = {
  title?: string | null;
  mp4Url?: string | null;
  stillUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

/** Share of the GIF on screen before it plays, as the video player does. */
const PLAY_RATIO = 0.6;

/**
 * A post's GIF: a muted looping video from GIPHY (lighter than a .gif
 * file) that plays only while mostly on screen, like the feed's video
 * player. Members who ask for reduced motion see the still frame (also
 * while the page is rendered on the server) and can play it themselves;
 * anyone can pause it, and the button always says what the video is
 * really doing. A GIF GIPHY no longer serves falls back to its still
 * frame, or says it is gone.
 */
export function FeedGif({ gif }: { gif: FeedGifView }) {
  const t = useTranslations("communities.feed");
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const ref = useRef<HTMLVideoElement>(null);
  /** The member's own play or pause; otherwise motion follows `reduce`. */
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);
  const moving = !videoFailed && (choice ? choice === "play" : !reduce);

  useEffect(() => {
    const el = ref.current;
    if (!moving || !el) return;
    // React does not reliably keep the `muted` DOM property in sync.
    el.muted = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio < PLAY_RATIO) el.pause();
        else void el.play()?.catch(() => undefined);
      },
      { threshold: [0, PLAY_RATIO, 1] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [moving]);

  if (!gif.mp4Url || !gif.stillUrl) return null;
  const label = gif.title ? `${t("gifBadge")}: ${gif.title}` : t("gifBadge");
  const width = gif.width ?? undefined;
  const height = gif.height ?? undefined;

  if (stillFailed && !moving) {
    return (
      <p className="border-border text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <ImageOff aria-hidden="true" className="size-4" />
        {t("gifGone")}
      </p>
    );
  }

  return (
    <figure
      className="bg-muted relative max-h-96 w-fit max-w-full overflow-hidden rounded-lg"
      style={
        width && height ? { aspectRatio: `${width} / ${height}` } : undefined
      }
    >
      {moving ? (
        <video
          ref={ref}
          src={gif.mp4Url}
          poster={gif.stillUrl}
          width={width}
          height={height}
          loop
          muted
          playsInline
          preload="metadata"
          aria-label={label}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => {
            setPlaying(false);
            setVideoFailed(true);
          }}
          className="max-h-96 w-auto max-w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- GIPHY media
        <img
          src={gif.stillUrl}
          alt={label}
          width={width}
          height={height}
          loading="lazy"
          onError={() => setStillFailed(true)}
          className="max-h-96 w-auto max-w-full object-contain"
        />
      )}
      <span
        aria-hidden="true"
        className="bg-background/90 absolute bottom-1.5 left-1.5 rounded px-1 font-mono text-[0.65rem] font-semibold"
      >
        GIF
      </span>
      {videoFailed ? null : (
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (moving && playing && el) {
              el.pause();
              setChoice("pause");
            } else if (moving && el) {
              setChoice("play");
              void el.play()?.catch(() => undefined);
            } else {
              setChoice("play");
            }
          }}
          aria-label={moving && playing ? t("pauseGif") : t("playGif")}
          className="bg-background/90 focus-visible:ring-ring/50 absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
        >
          {moving && playing ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
        </button>
      )}
    </figure>
  );
}
