"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { MemberStackView } from "@/components/communities/member-stack";
import { getInitials } from "@/lib/avatar";
import {
  ActivityLine,
  DistanceLine,
  NextEventLine,
  OpenRoomsLine,
  type DirectoryItem,
} from "./community-signals";
import { JoinAction } from "./join-action";

/**
 * A community in the directory grid. Leads with what is alive — people
 * active recently, the next event and where — and shows only the signals
 * that are there, so a quiet community reads as a calm card, not a list
 * of "nothing". Ends with the join control, so joining needs no detour.
 *
 * The card is not one big link (a button cannot live inside a link): the
 * name is the link, stretched over the card with `after:inset-0`, and the
 * join control sits above it.
 */
export function CommunityCard({
  community,
  showDistance = false,
}: {
  community: DirectoryItem;
  /** Show how far it is (when sorting by distance). */
  showDistance?: boolean;
}) {
  const t = useTranslations("communities.discover");
  const { slug, name, description, logoUrl, memberCount, faces } = community;
  const id = `community-card-${slug}`;
  const distance = showDistance ? community.distanceKm : null;
  const alive =
    distance !== null ||
    community.activeRecently > 0 ||
    community.nextEvent !== null ||
    community.openRooms > 0;

  return (
    <article
      aria-labelledby={`${id}-name`}
      className="group border-border bg-card hover:border-foreground/30 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-ring/50 relative flex h-full flex-col gap-4 rounded-xl border p-6 shadow-sm transition-colors has-[a:focus-visible]:ring-[3px]"
    >
      <div className="flex items-start gap-3">
        {logoUrl ? (
          <Avatar className="pointer-events-none size-10 shrink-0 rounded-md">
            <AvatarImage src={logoUrl} alt="" />
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        ) : (
          <SpaceAvatar name={name} className="pointer-events-none size-10" />
        )}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <h3
            id={`${id}-name`}
            title={name}
            className="line-clamp-2 text-base leading-snug font-semibold text-balance wrap-break-word"
          >
            <Link
              href={`/communities/${slug}`}
              aria-describedby={`${id}-about`}
              className="outline-none group-hover:underline group-hover:underline-offset-4 after:absolute after:inset-0 after:rounded-xl"
            >
              {name}
            </Link>
          </h3>
          {community.isNew ? (
            <Badge variant="secondary" className="mt-0.5">
              {t("isNew")}
            </Badge>
          ) : null}
        </div>
      </div>

      <div id={`${id}-about`} className="flex flex-1 flex-col gap-4">
        {description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed wrap-break-word">
            {description}
          </p>
        ) : null}
        {alive ? (
          <div className="space-y-1.5">
            {distance !== null ? <DistanceLine km={distance} /> : null}
            {community.activeRecently > 0 ? (
              <ActivityLine count={community.activeRecently} />
            ) : null}
            {community.nextEvent ? (
              <NextEventLine event={community.nextEvent} />
            ) : null}
            {community.openRooms > 0 ? (
              <OpenRoomsLine count={community.openRooms} />
            ) : null}
          </div>
        ) : null}
        <div className="border-border mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* Clicks pass through to the card link (no tooltips here). */}
            <div aria-hidden="true" className="pointer-events-none">
              <MemberStackView faces={faces} total={memberCount} />
            </div>
            <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
              {t("membersCount", { count: memberCount })}
            </span>
          </div>
          <JoinAction
            slug={slug}
            name={name}
            joinPolicy={community.joinPolicy}
            className="relative z-10 shrink-0"
          />
        </div>
      </div>
    </article>
  );
}
