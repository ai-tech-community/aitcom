"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import { CreateCommunityButton } from "@/components/communities/create-community-dialog";
import {
  COMMUNITY_STILL_TICK,
  communityHouseFrame,
  type CommunityLayer,
} from "@/components/ascii/community-house-scene";
import { cn } from "@/lib/utils";

const FRAME_MS = 160;

/** The empty lot waiting for its house: a seed no real slug uses. */
const WAITING_HOUSE_SEED = "your-community";

const LAYERS: readonly AsciiSceneLayer<CommunityLayer>[] = [
  { name: "far", className: "text-muted-foreground/40" },
  { name: "scenery", className: "text-muted-foreground/70" },
  { name: "people", className: "text-foreground/85" },
];

/**
 * The directory's close: an invitation to organizers, with a new house on
 * the square and its first two people waiting out front.
 */
export function OrganizerInvite({ className }: { className?: string }) {
  const t = useTranslations("communities.discover");
  const frame = useCallback(
    (tick: number, cols: number, rows: number) =>
      communityHouseFrame(WAITING_HOUSE_SEED, 2, cols, rows, tick),
    [],
  );
  return (
    <section
      aria-labelledby="organizer-invite-title"
      className={cn(
        "border-border grid overflow-hidden rounded-xl border md:grid-cols-5",
        className,
      )}
    >
      <div className="flex flex-col items-start gap-4 p-6 sm:p-8 md:col-span-3">
        <h2
          id="organizer-invite-title"
          className="text-2xl leading-tight font-semibold tracking-[-0.01em] text-balance"
        >
          {t("inviteTitle")}
        </h2>
        <p className="text-muted-foreground max-w-prose text-base leading-relaxed text-pretty">
          {t("inviteBody")}
        </p>
        <CreateCommunityButton variant="ink" size="lg" className="mt-2">
          {t("inviteAction")}
        </CreateCommunityButton>
      </div>
      <AsciiScene
        layers={LAYERS}
        frame={frame}
        frameMs={FRAME_MS}
        staticTick={COMMUNITY_STILL_TICK}
        minRows={6}
        className="border-border h-48 border-t font-mono text-[10px] leading-3 sm:text-xs sm:leading-[14px] md:col-span-2 md:h-auto md:min-h-56 md:border-t-0 md:border-l"
      />
    </section>
  );
}
