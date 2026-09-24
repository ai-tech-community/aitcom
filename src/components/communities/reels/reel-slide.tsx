"use client";

import { useState, type Ref } from "react";
import { Flag, Heart, Link2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";
import { FeedVideoPlayer } from "../feed/feed-video-player";

export type Reel = RouterOutputs["feed"]["getReels"]["items"][number];

/**
 * White-on-video controls: a dark backing keeps the glyph legible on any
 * frame, and the focus ring is full-strength Signal Orange so it reads on
 * black as well as on a bright frame.
 */
const overlayButton =
  "size-11 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white focus-visible:ring-ring focus-visible:ring-[3px] [&_svg:not([class*='size-'])]:size-5";

/**
 * One full-screen reel: the video (or only its thumbnail when it is too far
 * from the current one to load), the author and caption at the bottom left,
 * and the action rail on the right. Every action is decided by the viewer;
 * the slide only reports what was pressed.
 */
export function ReelSlide({
  ref,
  reel,
  position,
  loadVideo,
  isCurrent,
  canReport,
  likePending,
  onLike,
  onComments,
  onCopyLink,
  onReport,
  onVideoExpired,
}: {
  ref?: Ref<HTMLElement>;
  reel: Reel;
  /** 1-based position and total, for the slide's accessible name. */
  position: { current: number; total: number };
  /** Mount a real video element (the current reel and the next one). */
  loadVideo: boolean;
  /**
   * The reel on screen buffers fully; the next one fetches only its metadata,
   * so scrolling past it never costs a whole file.
   */
  isCurrent: boolean;
  canReport: boolean;
  likePending: boolean;
  onLike: () => void;
  onComments: () => void;
  onCopyLink: () => void;
  onReport: () => void;
  /** Resolves true only when a different, fresh link is on its way. */
  onVideoExpired: () => Promise<boolean>;
}) {
  const t = useTranslations("communities.reels");
  const tReport = useTranslations("communities.report");
  const [captionOpen, setCaptionOpen] = useState(false);
  const video = reel.video;
  const landscape = !!video && video.width > video.height;
  // Fit the whole frame: portrait fills the height, landscape the width.
  const fit = landscape
    ? "h-auto w-full max-w-full rounded-none bg-black"
    : "h-full w-auto max-w-full rounded-none bg-black";
  const likeCount = reel.likeCount ?? 0;
  const commentCount = reel.commentCount ?? 0;

  return (
    <section
      ref={ref}
      aria-roledescription="slide"
      aria-label={t("position", position)}
      className="relative flex h-full snap-start snap-always items-center justify-center overflow-hidden bg-black"
    >
      {video && loadVideo ? (
        <FeedVideoPlayer
          video={video}
          preload={isCurrent ? "auto" : "metadata"}
          onExpired={onVideoExpired}
          className={fit}
        />
      ) : video ? (
        // A thumbnail only: reels far from the current one load no video.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl}
          alt=""
          className={cn("object-cover", fit)}
          style={{
            aspectRatio:
              video.width > 0 && video.height > 0
                ? String(video.width / video.height)
                : "9 / 16",
          }}
        />
      ) : null}

      {/* Bottom scrim + author and caption. It sits above the player's own
          play and sound buttons, and lets pointer events through to them. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pt-20 pr-20 pb-14">
        <div className="flex items-center gap-2">
          <Avatar className="size-8 border border-white/30">
            {reel.authorImage ? (
              <AvatarImage src={reel.authorImage} alt="" />
            ) : null}
            <AvatarFallback className="text-xs">
              {getInitials(reel.authorName ?? "?")}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm font-semibold">{reel.authorName}</p>
          <span className="rounded-sm border border-white/40 px-1.5 py-0.5 text-xs text-white">
            {video?.visibility === "public" ? t("public") : t("communityOnly")}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={captionOpen}
          onClick={() => setCaptionOpen((open) => !open)}
          className="focus-visible:ring-ring pointer-events-auto mt-2 block max-w-prose rounded-sm text-left text-sm leading-relaxed outline-none focus-visible:ring-[3px]"
        >
          <span
            className={cn(
              "block whitespace-pre-wrap",
              captionOpen ? "max-h-[40dvh] overflow-y-auto" : "line-clamp-2",
            )}
          >
            {reel.content}
          </span>
        </button>
      </div>

      {/* Action rail */}
      <div className="absolute right-3 bottom-28 flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={overlayButton}
            aria-label={t("like")}
            aria-pressed={reel.hasLiked}
            disabled={likePending}
            onClick={onLike}
          >
            <Heart
              aria-hidden="true"
              className={cn(reel.hasLiked && "fill-current")}
            />
          </Button>
          <span className="font-mono text-xs tabular-nums">{likeCount}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={overlayButton}
            aria-label={t("comments", { count: commentCount })}
            onClick={onComments}
          >
            <MessageSquare aria-hidden="true" />
          </Button>
          <span aria-hidden="true" className="font-mono text-xs tabular-nums">
            {commentCount}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={overlayButton}
          aria-label={t("copyLink")}
          onClick={onCopyLink}
        >
          <Link2 aria-hidden="true" />
        </Button>
        {canReport ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={overlayButton}
            aria-label={tReport("action")}
            onClick={onReport}
          >
            <Flag aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
