"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";

export function SpaceRow({
  spaceName, spaceSlug, communityName, communitySlug, memberCount,
}: {
  spaceName: string | null; spaceSlug: string;
  communityName: string; communitySlug: string; memberCount: number;
}) {
  const t = useTranslations("communities.discover");
  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 p-3 transition-colors">
      <SpaceAvatar name={spaceName} />
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold">#{spaceName ?? "room"}</span>
        <p className="text-muted-foreground truncate text-sm">
          {t("inCommunity", { community: communityName })}
        </p>
      </div>
      <span
        className="text-muted-foreground hidden shrink-0 items-center gap-1 font-mono text-xs sm:inline-flex"
        aria-label={t("membersCount", { count: memberCount })}
      >
        <Users aria-hidden="true" className="size-3.5" />
        {memberCount}
      </span>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href={`/communities/${communitySlug}/spaces/${spaceSlug}`}>{t("open")}</Link>
      </Button>
    </li>
  );
}
