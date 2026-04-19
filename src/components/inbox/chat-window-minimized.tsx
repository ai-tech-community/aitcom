"use client";

import Image from "next/image";
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
    <div className="border-border bg-background flex items-center gap-1 rounded-lg border px-2 py-2 shadow-lg transition-opacity hover:opacity-90">
      <button
        type="button"
        onClick={() => restoreChat(conversationId)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left"
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {image ? (
            <Image
              src={image}
              alt={displayName}
              width={24}
              height={24}
              unoptimized
              className="h-6 w-6 rounded-full object-cover"
            />
          ) : (
            <div className="bg-secondary text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          {isAgent && (
            <span className="bg-background absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full">
              <BotIcon className="text-muted-foreground h-2.5 w-2.5" />
            </span>
          )}
        </div>

        {/* Name */}
        <span className="text-foreground max-w-[120px] truncate text-sm font-medium">
          {displayName}
        </span>
      </button>

      {/* Close button */}
      <button
        type="button"
        onClick={() => closeChat(conversationId)}
        className="text-muted-foreground hover:bg-secondary/50 hover:text-foreground rounded-md p-0.5 transition-colors"
        aria-label="Close"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
