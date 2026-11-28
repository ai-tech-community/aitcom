"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { MessageMemberButton } from "@/components/message-member-button";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const reason = !viewerId
    ? "messageSignIn"
    : viewerId === memberId
      ? "messageSelf"
      : !canOpenProfile
        ? "messagePrivate"
        : null;

  if (!reason) {
    return <MessageMemberButton recipientId={memberId} recipientName={name} />;
  }

  const label = t(reason, { name });
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
          className="text-muted-foreground min-h-11 max-w-32 min-w-11 whitespace-normal sm:min-h-9"
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
