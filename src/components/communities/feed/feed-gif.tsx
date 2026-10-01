"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";

export type FeedGifView = {
  title?: string | null;
  mp4Url?: string | null;
  stillUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

/**
 * A post's GIF: a looping, muted video from GIPHY (lighter than a .gif
 * file). Members who ask for reduced motion see the still frame and can
 * play it themselves; anyone can pause it.
 */
export function FeedGif({ gif }: { gif: FeedGifView }) {
  const t = useTranslations("communities.feed");
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)", false);
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);
  const playing = choice ? choice === "play" : !reduce;
  if (!gif.mp4Url || !gif.stillUrl) return null;
  const label = gif.title ? `${t("gifBadge")}: ${gif.title}` : t("gifBadge");

  return (
    <figure
      className="bg-muted relative max-h-96 w-fit max-w-full overflow-hidden rounded-lg"
      style={
        gif.width && gif.height
          ? { aspectRatio: `${gif.width} / ${gif.height}` }
          : undefined
      }
    >
      {playing ? (
        <video
          src={gif.mp4Url}
          poster={gif.stillUrl}
          autoPlay
          loop
          muted
          playsInline
          aria-label={label}
          className="max-h-96 w-auto max-w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- GIPHY media
        <img
          src={gif.stillUrl}
          alt={label}
          className="max-h-96 w-auto max-w-full object-contain"
        />
      )}
      <span
        aria-hidden="true"
        className="bg-background/90 absolute bottom-1.5 left-1.5 rounded px-1 font-mono text-[0.65rem] font-semibold"
      >
        GIF
      </span>
      <button
        type="button"
        onClick={() => setChoice(playing ? "pause" : "play")}
        aria-label={playing ? t("pauseGif") : t("playGif")}
        className="bg-background/90 focus-visible:ring-ring/50 absolute right-1.5 bottom-1.5 flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-[3px]"
      >
        {playing ? (
          <Pause aria-hidden="true" className="size-4" />
        ) : (
          <Play aria-hidden="true" className="size-4" />
        )}
      </button>
    </figure>
  );
}
