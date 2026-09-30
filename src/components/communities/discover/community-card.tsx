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
  JoinPolicyLabel,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";

/**
 * A community in the directory grid. Answers "is anyone here?" before the
 * click: recent activity, the next event and where, how to get in, and who
 * the members are.
 */
export function CommunityCard({ community }: { community: DirectoryItem }) {
  const t = useTranslations("communities.discover");
  const { slug, name, description, logoUrl, memberCount, faces } = community;
  const id = `community-card-${slug}`;

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
        <div className="min-w-0 flex-1 space-y-1">
          <h3
            id={`${id}-name`}
            title={name}
            className="line-clamp-2 text-base leading-snug font-semibold wrap-break-word text-balance group-hover:underline group-hover:underline-offset-4"
          >
            {name}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <JoinPolicyLabel policy={community.joinPolicy} />
            {community.isNew ? (
              <Badge variant="secondary">{t("isNew")}</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div id={`${id}-about`} className="flex flex-1 flex-col gap-4">
        {description ? (
          <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed wrap-break-word">
            {description}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <NextEventLine event={community.nextEvent} />
          <ActivityLine count={community.activeRecently} />
        </div>
        <div className="border-border mt-auto flex items-center justify-between gap-3 border-t pt-4">
          <div aria-hidden="true">
            <MemberStackView faces={faces} total={memberCount} />
          </div>
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {t("membersCount", { count: memberCount })}
          </span>
        </div>
      </div>
    </Link>
  );
}
