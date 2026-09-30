"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { MemberStackView } from "@/components/communities/member-stack";
import { getInitials } from "@/lib/avatar";
import {
  ActivityLine,
  JoinPolicyLabel,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";

/**
 * A community in the directory grid. Leads with what is alive — people
 * active recently, the next event and where — and shows only the signals
 * that are there, so a quiet community reads as a calm card, not a list
 * of "nothing". Ends with how to get in.
 */
export function CommunityCard({ community }: { community: DirectoryItem }) {
  const t = useTranslations("communities.discover");
  const { slug, name, description, logoUrl, memberCount, faces } = community;
  const id = `community-card-${slug}`;
  const alive = community.activeRecently > 0 || community.nextEvent !== null;

  return (
    <Link
      href={`/communities/${slug}`}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-about`}
      className="group border-border bg-card hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-full flex-col gap-4 rounded-xl border p-6 shadow-sm transition-colors outline-none focus-visible:ring-[3px]"
    >
      <div className="flex items-start gap-3">
        {logoUrl ? (
          <Avatar className="size-10 shrink-0 rounded-md">
            <AvatarImage src={logoUrl} alt="" />
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        ) : (
          <SpaceAvatar name={name} className="size-10" />
        )}
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <h3
            id={`${id}-name`}
            title={name}
            className="line-clamp-2 text-base leading-snug font-semibold wrap-break-word text-balance"
          >
            {name}
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
            {community.activeRecently > 0 ? (
              <ActivityLine count={community.activeRecently} />
            ) : null}
            {community.nextEvent ? (
              <NextEventLine event={community.nextEvent} />
            ) : null}
          </div>
        ) : null}
        <div className="border-border mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <div aria-hidden="true">
              <MemberStackView faces={faces} total={memberCount} />
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {t("membersCount", { count: memberCount })}
            </span>
          </div>
          <span className="text-foreground inline-flex shrink-0 items-center gap-1 text-sm font-medium">
            <JoinPolicyLabel
              policy={community.joinPolicy}
              className="text-foreground text-sm font-medium"
            />
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </span>
        </div>
      </div>
    </Link>
  );
}
