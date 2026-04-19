"use client";

import { BotIcon } from "lucide-react";
import Image from "next/image";
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

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

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
        {avatar ? (
          <div className="relative h-10 w-10 overflow-hidden rounded-full">
            <Image
              src={avatar}
              alt={displayName}
              fill
              sizes="40px"
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="bg-secondary text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
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
            <span className="text-muted-foreground ml-2 shrink-0 font-mono text-[10px]">
              {timeAgo(parsedLastMessageAt)}
            </span>
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
