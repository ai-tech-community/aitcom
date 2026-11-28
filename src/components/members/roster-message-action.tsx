"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";

import { MessageMemberButton } from "@/components/message-member-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "@/i18n/navigation";

const actionClassName =
  "min-h-11 max-w-32 min-w-11 whitespace-normal sm:min-h-9";

function RosterSignInLink() {
  const t = useTranslations("redesign.members");
  const pathname = usePathname();
  const query = useSearchParams()?.toString();
  const redirect = encodeURIComponent(
    query ? `${pathname}?${query}` : pathname,
  );

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={`h-auto py-1.5 ${actionClassName}`}
    >
      <Link href={`/auth/signin?redirect=${redirect}`}>
        {t("messageSignIn")}
      </Link>
    </Button>
  );
}

export function RosterMessageAction({
  memberId,
  name,
  viewerId,
  canOpenProfile = true,
}: {
  memberId: string;
  name: string;
  viewerId?: string | null;
  canOpenProfile?: boolean;
}) {
  const t = useTranslations("redesign.members");
  const descriptionId = useId();
  if (!viewerId) return <RosterSignInLink />;

  const reason =
    viewerId === memberId
      ? "messageSelf"
      : canOpenProfile
        ? null
        : "messagePrivate";

  if (!reason) {
    return <MessageMemberButton recipientId={memberId} recipientName={name} />;
  }

  const label = t(reason);
  const unavailable = t(
    reason === "messageSelf" ? "messageYou" : "messagesOff",
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-describedby={descriptionId}
          title={label}
          className={`text-muted-foreground ${actionClassName}`}
        >
          {unavailable}
        </Button>
      </PopoverTrigger>
      <span id={descriptionId} className="sr-only">
        {label}
      </span>
      <PopoverContent
        aria-label={t("message")}
        align="end"
        side="top"
        className="w-64 max-w-[calc(100vw-2rem)] p-3 text-sm motion-reduce:animate-none"
      >
        {label}
      </PopoverContent>
    </Popover>
  );
}
