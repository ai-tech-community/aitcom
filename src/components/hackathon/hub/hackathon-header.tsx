import Image from "next/image";
import { getTranslations } from "next-intl/server";

import type { Event, Media } from "@/payload-types";
import type { HackathonPhase } from "@/server/hackathon/phase";
import { Badge } from "@/components/ui/badge";
import { EventTimeDisplay } from "@/components/event-time-display";

// Mirrors the event page's getMedia: the cover image is a relation that may be
// an id, null, or a resolved Media doc — only the resolved doc has a usable url.
function getCoverImage(media: (number | null) | Media | undefined) {
  if (media && typeof media === "object" && "url" in media && media.url) {
    return { url: media.url, alt: media.alt ?? undefined };
  }
  return null;
}

// Phase → i18n key, copied from hackathon-manage's statusLabel so the public
// header and the operator UI always read the same words.
const PHASE_LABEL_KEY: Record<HackathonPhase, string> = {
  draft: "statusDraft",
  live: "statusLive",
  locked: "statusLocked",
  judging: "statusJudging",
  finalized: "statusFinalized",
};

export async function HackathonHeader({
  event,
  phase,
}: {
  event: Event;
  phase: HackathonPhase;
}) {
  const t = await getTranslations("hackathon");
  const cover = getCoverImage(event.coverImage ?? event.image);
  const statusLabel = t(PHASE_LABEL_KEY[phase]);

  return (
    <div className="border-border bg-secondary/30 relative overflow-hidden rounded-2xl border">
      <div className="relative h-48 w-full sm:h-64">
        {cover ? (
          <Image
            src={cover.url}
            alt={cover.alt ?? event.title}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 1024px, 100vw"
          />
        ) : (
          <div className="from-foreground/10 via-foreground/5 absolute inset-0 bg-linear-to-br to-transparent" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/70 to-black/30" />
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-3 p-6 sm:p-8">
        {/* Same variant rule as the manage page: outline for draft, secondary otherwise. */}
        <Badge variant={phase === "draft" ? "outline" : "secondary"}>
          {statusLabel}
        </Badge>
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl">
          {event.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/80">
          <EventTimeDisplay
            date={event.date}
            startTime={event.startTime ?? null}
            endTime={event.endTime ?? null}
            timezone={event.timezone ?? null}
          />
          {event.location && (
            <div className="font-mono text-[11px] tracking-wider sm:text-xs">
              {event.location}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
