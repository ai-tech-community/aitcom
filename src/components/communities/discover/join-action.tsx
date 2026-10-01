"use client";

import { useTranslations } from "next-intl";
import { Check, Clock, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JoinPolicy } from "@/server/communities/invite-policy";
import { useCommunityJoin } from "@/components/communities/use-community-join";
import { cn } from "@/lib/utils";

/**
 * The directory's join control for one community: a quiet button to join
 * or request, or a short status ("Request sent", "By invitation",
 * "You're in"). Outline, never orange: a page of cards would otherwise be a
 * page of primary buttons. Leaving lives on the community page, not here.
 */
export function JoinAction({
  slug,
  name,
  joinPolicy,
  className,
}: {
  slug: string;
  name: string;
  joinPolicy: JoinPolicy;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const { action, run, busy } = useCommunityJoin({ slug, name, joinPolicy });

  const status = (icon: React.ReactNode, label: string, tone?: string) => (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        tone ?? "text-muted-foreground",
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );

  switch (action.kind) {
    case "join":
    case "request":
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run()}
          aria-label={`${action.kind === "join" ? t("joinAction") : t("requestAction")}: ${name}`}
          className={className}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : null}
          {action.kind === "join" ? t("joinAction") : t("requestAction")}
        </Button>
      );
    case "pending":
      return status(
        <Clock aria-hidden="true" className="size-4" />,
        t("pendingAction"),
      );
    case "invite_only":
      return status(
        <Mail aria-hidden="true" className="size-4" />,
        t("inviteOnly"),
      );
    case "member":
      return status(
        <Check aria-hidden="true" className="size-4" />,
        t("youreIn"),
        "text-success",
      );
    case "unavailable":
      return null;
  }
}
