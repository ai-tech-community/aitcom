"use client";

import { useEffect, useRef } from "react";
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
 *
 * When a press succeeds the button becomes a status; focus moves to that
 * status, so keyboard and screen-reader users stay where they were.
 */
export function JoinAction({
  slug,
  name,
  joinPolicy,
  onPress,
  className,
}: {
  slug: string;
  name: string;
  joinPolicy: JoinPolicy;
  /** Told when the button is pressed (e.g. to keep a preview pinned). */
  onPress?: () => void;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const { action, run, busy } = useCommunityJoin({ slug, name, joinPolicy });
  const pressed = useRef(false);
  const statusRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pressed.current) return;
    if (action.kind === "member" || action.kind === "pending") {
      pressed.current = false;
      statusRef.current?.focus();
    }
  }, [action.kind]);

  const status = (icon: React.ReactNode, label: string, tone?: string) => (
    <span
      ref={statusRef}
      tabIndex={-1}
      className={cn(
        "focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium outline-none focus-visible:ring-[3px]",
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
    case "request": {
      const label =
        action.kind === "join" ? t("joinAction") : t("requestAction");
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => {
            pressed.current = true;
            onPress?.();
            void run();
          }}
          aria-label={`${label}: ${name}`}
          className={cn("grid", className)}
        >
          {/* Label and spinner share one cell, so the button keeps its
              width while working. */}
          <span className={cn("col-start-1 row-start-1", busy && "invisible")}>
            {label}
          </span>
          {busy ? (
            <Loader2
              aria-hidden="true"
              className="col-start-1 row-start-1 animate-spin justify-self-center"
            />
          ) : null}
        </Button>
      );
    }
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
