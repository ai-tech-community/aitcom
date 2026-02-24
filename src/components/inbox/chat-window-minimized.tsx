"use client";

import { BotIcon, XIcon } from "lucide-react";
import { useInbox } from "./inbox-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatWindowMinimizedProps = {
  conversationId: string;
  displayName: string;
  image: string | null;
  isAgent: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatWindowMinimized({
  conversationId,
  displayName,
  image,
  isAgent,
}: ChatWindowMinimizedProps) {
  const { closeChat, restoreChat } = useInbox();

  return (
    <button
      type="button"
      onClick={() => restoreChat(conversationId)}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 shadow-lg transition-opacity hover:opacity-90"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {image ? (
          <img
            src={image}
            alt={displayName}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-muted-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {isAgent && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background">
            <BotIcon className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        )}
      </div>

      {/* Name */}
      <span className="max-w-[120px] truncate text-sm font-medium text-foreground">
        {displayName}
      </span>

      {/* Close button */}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          closeChat(conversationId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            closeChat(conversationId);
          }
        }}
        className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
        aria-label="Close"
      >
        <XIcon className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
