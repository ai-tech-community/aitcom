"use client";

import { useTranslations } from "next-intl";
import { Loader2, LogOut, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import type {
  JoinPolicy,
  MembershipStatus,
} from "@/server/communities/invite-policy";
import { useCommunityJoin } from "./use-community-join";

interface CommunityActionsMenuProps {
  slug: string;
  name: string;
  joinPolicy: JoinPolicy;
  membershipStatus: MembershipStatus | null;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  /** After a successful leave, before the page data refreshes. */
  onLeft?: () => void;
}

/**
 * A member's actions on the community itself, behind a "⋯" button in the
 * compact identity row: today, Leave Community. Follows the shared
 * `viewerJoinAction` rule through `useCommunityJoin`, so it shows only to a
 * member who may leave (never the owner, never in the Hub).
 */
export function CommunityActionsMenu({
  slug,
  name,
  joinPolicy,
  membershipStatus,
  memberRole,
  onLeft,
}: CommunityActionsMenuProps) {
  const t = useTranslations("communities.profile");
  const router = useRouter();
  const { action, leave, busy } = useCommunityJoin({
    slug,
    name,
    joinPolicy,
    membership: membershipStatus
      ? { status: membershipStatus, role: memberRole ?? "member" }
      : null,
    onChange: () => {
      onLeft?.();
      router.refresh();
    },
  });

  if (action.kind !== "member" || !action.canLeave) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={t("communityActions")}
          aria-busy={busy || undefined}
        >
          {/* The menu closes on choosing Leave; the trigger shows it is running. */}
          {busy ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <MoreHorizontal aria-hidden="true" className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={busy} onSelect={() => void leave()}>
          <LogOut aria-hidden="true" />
          {t("leave")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
