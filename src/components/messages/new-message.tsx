"use client";

import { useState } from "react";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/section-label";
import { getInitials } from "@/lib/avatar";

type NewMessageProps = {
  onCancel: () => void;
  /** Called after a conversation is started (e.g. close the overlay). */
  onStarted?: (conversationId: string) => void;
};

export function NewMessage({ onCancel, onStarted }: NewMessageProps) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");

  const membersQuery = api.inbox.searchMembers.useQuery(
    { query, limit: 10 },
    { enabled: query.trim().length > 0 },
  );

  const startConversation = api.inbox.startConversation.useMutation({
    onSuccess: async (data) => {
      await utils.inbox.listConversations.invalidate();
      onStarted?.(data.conversationId);
      router.push(`/messages/${data.conversationId}`);
    },
  });

  const members = membersQuery.data?.members ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring -ml-1 rounded-md p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label={t("back")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <SectionLabel bordered={false} marker={false}>
          {t("newMessage")}
        </SectionLabel>
      </div>

      {/* Search */}
      <div className="border-border border-b px-3 py-2.5">
        <div className="bg-secondary focus-within:ring-ring flex items-center gap-2 rounded-full px-3 py-1.5 transition-shadow focus-within:ring-2">
          <SearchIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchMembers")}
            aria-label={t("searchMembers")}
            className="text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* Results */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {query.trim().length === 0 ? (
          <div className="flex items-center justify-center px-6 py-12 text-center">
            <p className="text-muted-foreground text-sm">{t("searchMembers")}</p>
          </div>
        ) : membersQuery.isLoading ? (
          <ul className="flex flex-col px-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-2.5 py-2.5">
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="h-3.5 w-1/2" />
              </li>
            ))}
          </ul>
        ) : members.length === 0 ? (
          <div className="flex items-center justify-center px-6 py-12 text-center">
            <p className="text-muted-foreground text-sm">{t("noResults")}</p>
          </div>
        ) : (
          <ul className="flex flex-col px-1.5">
            {members.map((member) => (
              <li key={member.userId}>
                <button
                  type="button"
                  disabled={startConversation.isPending}
                  onClick={() =>
                    startConversation.mutate({ recipientId: member.userId })
                  }
                  className="hover:bg-secondary/60 focus-visible:ring-ring flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                >
                  <Avatar size="lg">
                    {member.image && (
                      <AvatarImage
                        src={member.image}
                        alt={member.displayName}
                      />
                    )}
                    <AvatarFallback>
                      {getInitials(member.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-foreground truncate text-sm font-medium">
                    {member.displayName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
