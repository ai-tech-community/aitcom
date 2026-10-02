"use client";

import { useEffect, useRef, type RefObject } from "react";
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
  /** `compact` fits a tight header (one line, small invitation buttons). */
  size?: "default" | "compact";
  /**
   * Where focus goes once an invitation is answered (the answer buttons go
   * away), e.g. the community's heading. Without it, focus moves to the
   * control that replaces them, when there is one.
   */
  focusAfterAnswer?: RefObject<HTMLElement | null>;
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
  size = "default",
  focusAfterAnswer,
}: JoinButtonProps) {
  const t = useTranslations("communities.profile");
  const router = useRouter();
  const controlRef = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);
  const { action, run, leave, busy } = useCommunityJoin({
    slug,
    name,
    joinPolicy,
    membership: membershipStatus
      ? { status: membershipStatus, role: memberRole ?? "member" }
      : null,
    onChange: () => router.refresh(),
  });

  // Once the answer shows (the membership reloaded), focus its control, so
  // keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (!answered.current || action.kind === "invited") return;
    answered.current = false;
    controlRef.current?.focus();
  }, [action.kind]);

  const onAnswered = () => {
    router.refresh();
    const target = focusAfterAnswer?.current;
    if (target) target.focus();
    else answered.current = true;
  };

  switch (action.kind) {
    case "invite_only":
    case "unavailable":
      return null;
    case "invited":
      return (
        <InviteResponse
          slug={slug}
          name={name}
          variant={size === "compact" ? "compact" : "page"}
          onAnswered={onAnswered}
        />
      );
    case "pending":
      return (
        <Button ref={controlRef} variant="outline" disabled>
          <Clock className="size-4" />
          {t("pending")}
        </Button>
      );
    case "member":
      // Owners cannot leave; the Hub is where every member belongs — the
      // header's Member badge is the "you're in" signal.
      if (!action.canLeave) return null;
      return (
        <Button
          ref={controlRef}
          variant="outline"
          onClick={() => void leave()}
          disabled={busy}
        >
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
        <Button ref={controlRef} onClick={() => void run()} disabled={busy}>
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
