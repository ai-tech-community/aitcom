"use client";

import { BotIcon } from "lucide-react";
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

  return (
    <button
      type="button"
      onClick={() => openChat(id)}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary/50"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {type === "agent" && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
            <BotIcon className="h-3 w-3 text-muted-foreground" />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={`truncate text-sm ${unreadCount > 0 ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
            {displayName}
          </span>
          {lastMessageAt && (
            <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
              {timeAgo(new Date(lastMessageAt))}
            </span>
          )}
        </div>
        {preview && (
          <p className={`truncate text-xs ${unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {lastMessageSenderType === "agent" ? "Agent: " : ""}
            {preview}
          </p>
        )}
      </div>

      {/* Unread dot */}
      {unreadCount > 0 && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
