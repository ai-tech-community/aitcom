"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { useSpaceWindows } from "@/components/communities/explore/space-window-provider";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";

export function SpaceCard({
  spaceName,
  spaceSlug,
  communityName,
  communitySlug,
  memberCount,
}: {
  spaceName: string | null;
  spaceSlug: string;
  communityName: string;
  communitySlug: string;
  memberCount: number;
}) {
  const t = useTranslations("communities.discover");
  const { openSpace } = useSpaceWindows();
  const { requireAuth } = useRequireAuth();
  const label = spaceName ?? t("roomFallback");
  return (
    <button
      type="button"
      onClick={() =>
        requireAuth(
          () => openSpace({ communitySlug, spaceSlug, spaceName, communityName }),
          t("signInToOpenSpace", { space: label }),
        )
      }
      aria-label={t("openSpace", { space: label })}
      className="border-border hover:border-foreground/30 hover:bg-muted/40 flex h-full flex-col gap-3 rounded-lg border p-4 text-left transition-colors"
    >
      <div className="flex items-center gap-3">
        <SpaceAvatar name={spaceName} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">#{label}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {t("inCommunity", { community: communityName })}
          </span>
        </div>
      </div>
      <div className="mt-auto flex items-center">
        <span
          aria-label={t("membersCount", { count: memberCount })}
          className="text-muted-foreground inline-flex items-center gap-1 font-mono text-xs"
        >
          <Users aria-hidden="true" className="size-3.5" />
          {memberCount}
        </span>
      </div>
    </button>
  );
}
