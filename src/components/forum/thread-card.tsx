"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { MessageSquare, Eye, MoreHorizontal, Pin, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RoleBadge } from "./role-badge";
import type { ForumThread } from "@/payload-types";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ThreadCardProps = {
  thread: ForumThread;
  index: number;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  communitySlug?: string;
};

export function ThreadCard({
  thread,
  index,
  memberRole,
  communitySlug,
}: ThreadCardProps) {
  const t = useTranslations("forum");
  const utils = api.useUtils();
  const canModerate =
    memberRole === "owner" ||
    memberRole === "admin" ||
    memberRole === "moderator";

  const pinMutation = api.forum.pinThread.useMutation({
    onSuccess: () => void utils.forum.getThreads.invalidate(),
  });
  const lockMutation = api.forum.lockThread.useMutation({
    onSuccess: () => void utils.forum.getThreads.invalidate(),
  });

  return (
    <LazyMotion features={domAnimation}>
      <Link
        href={
          communitySlug
            ? (`/communities/${communitySlug}/forum/${thread.slug}` as never)
            : `/forum/${thread.slug}`
        }
      >
        <m.div
          className="border-border bg-muted hover:border-border hover:bg-accent mb-3 w-full rounded-lg border p-3 text-left transition-colors"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-foreground text-sm leading-snug font-medium">
              {thread.isPinned && (
                <span className="mr-1 font-mono text-xs text-orange-600">
                  PIN
                </span>
              )}
              {thread.title}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {thread.isLocked && (
                <Lock className="text-muted-foreground h-3 w-3" />
              )}
              {/* Post type is categorical, not a status → neutral Badge. */}
              <Badge
                variant="secondary"
                className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider uppercase"
              >
                {t(thread.category)}
              </Badge>
              {canModerate && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="hover:bg-accent rounded p-1"
                    onClick={(e) => e.preventDefault()}
                  >
                    <MoreHorizontal className="text-muted-foreground h-3.5 w-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        pinMutation.mutate({
                          threadId: thread.id,
                          isPinned: !thread.isPinned,
                        });
                      }}
                    >
                      <Pin className="mr-2 h-3.5 w-3.5" />
                      {thread.isPinned ? t("unpinThread") : t("pinThread")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        lockMutation.mutate({
                          threadId: thread.id,
                          isLocked: !thread.isLocked,
                        });
                      }}
                    >
                      <Lock className="mr-2 h-3.5 w-3.5" />
                      {thread.isLocked ? t("unlockThread") : t("lockThread")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
              <MessageSquare className="h-2.5 w-2.5" />
              {t("replies", { count: thread.replyCount ?? 0 })}
            </span>
            {(thread.viewCount ?? 0) > 0 && (
              <span className="text-muted-foreground hidden items-center gap-1 font-mono text-xs sm:flex">
                <Eye className="h-2.5 w-2.5" />
                {t("views", { count: thread.viewCount ?? 0 })}
              </span>
            )}
            {thread.lastActivityAt && (
              <RelativeTime
                date={thread.lastActivityAt}
                className="text-muted-foreground text-xs"
              />
            )}
            {thread.authorName && (
              <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
                {thread.authorName}
                <RoleBadge role={thread.authorRole} />
              </span>
            )}
          </div>
        </m.div>
      </Link>
    </LazyMotion>
  );
}
