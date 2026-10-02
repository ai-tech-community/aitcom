"use client";

import { useTranslations } from "next-intl";
import { LogIn, Clock, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type {
  JoinPolicy,
  MembershipStatus as ViewerMembershipStatus,
} from "@/server/communities/invite-policy";
import { InviteResponse } from "./invite-response";
import { useCommunityJoin } from "./use-community-join";

/** Includes "banned", so the shared rule can hide the button for them. */
type MembershipStatus = ViewerMembershipStatus | null;

interface JoinButtonProps {
  slug: string;
  /** For messages; generic wording when absent. */
  name?: string;
  joinPolicy: JoinPolicy;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

/**
 * The community page's join control: join, request, pending, answer an
 * invitation, or leave.
 * Follows the shared `viewerJoinAction` rule through `useCommunityJoin`,
 * with the membership the page already loaded on the server.
 */
export function JoinButton({
  slug,
  name,
  joinPolicy,
  membershipStatus,
  memberRole,
}: JoinButtonProps) {
  const t = useTranslations("communities.profile");
  const router = useRouter();
  const { action, run, leave, busy } = useCommunityJoin({
    slug,
    name,
    joinPolicy,
    membership: membershipStatus
      ? { status: membershipStatus, role: memberRole ?? "member" }
      : null,
    onChange: () => router.refresh(),
  });

  switch (action.kind) {
    case "invite_only":
    case "unavailable":
      return null;
    case "invited":
      return (
        <InviteResponse
          slug={slug}
          name={name}
          onChange={() => router.refresh()}
        />
      );
    case "pending":
      return (
        <Button variant="outline" disabled>
          <Clock className="size-4" />
          {t("pending")}
        </Button>
      );
    case "member":
      // Owners cannot leave; the Hub is where every member belongs — the
      // header's Member badge is the "you're in" signal.
      if (!action.canLeave) return null;
      return (
        <Button variant="outline" onClick={() => void leave()} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          {t("leave")}
        </Button>
      );
    case "join":
    case "request":
      return (
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          {action.kind === "request" ? t("requestToJoin") : t("join")}
        </Button>
      );
  }
}
