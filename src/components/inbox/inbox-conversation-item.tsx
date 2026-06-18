"use client";

import { BotIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { RelativeTime } from "@/components/ui/relative-time";
import { getInitials } from "@/lib/avatar";
import { useInbox } from "./inbox-provider";

type ConversationItemProps = {
  id: string;
  type: "agent" | "dm";
  displayName: string;
  image: string | null;
  agentAvatar?: string | null;
  lastMessage: string | null;
  lastMessageSenderType: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};

export function InboxConversationItem({
  id,
  type,
  displayName,
  image,
  agentAvatar,
  lastMessage,
  lastMessageSenderType,
  lastMessageAt,
  unreadCount,
}: ConversationItemProps) {
  const { openChat } = useInbox();

  const avatar = type === "agent" ? agentAvatar : image;
  const preview = lastMessage
    ? lastMessage.length > 40
      ? lastMessage.slice(0, 40) + "..."
      : lastMessage
    : null;

  const parsedLastMessageAt = lastMessageAt ? new Date(lastMessageAt) : null;
  const isLastMessageAtValid =
    parsedLastMessageAt && !Number.isNaN(parsedLastMessageAt.getTime());

  return (
    <button
      type="button"
      onClick={() => openChat(id)}
      className="hover:bg-secondary/50 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar size="lg">
          {avatar && <AvatarImage src={avatar} alt={displayName} />}
          <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
        </Avatar>
        {type === "agent" && (
          <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full">
            <BotIcon className="text-muted-foreground h-3 w-3" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span
            className={`truncate text-sm ${unreadCount > 0 ? "text-foreground font-semibold" : "text-foreground font-medium"}`}
          >
            {displayName}
          </span>
          {isLastMessageAtValid && parsedLastMessageAt && (
            <RelativeTime
              date={parsedLastMessageAt}
              className="text-muted-foreground ml-2 shrink-0 text-[10px]"
            />
          )}
        </div>
        {preview && (
          <p
            className={`truncate text-xs ${unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}
          >
            {lastMessageSenderType === "agent" ? "Agent: " : ""}
            {preview}
          </p>
        )}
      </div>

      {/* Unread dot */}
      {unreadCount > 0 && (
        <span className="bg-primary h-2.5 w-2.5 shrink-0 rounded-full" />
      )}
    </button>
  );
}
