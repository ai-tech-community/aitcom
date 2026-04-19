"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { MessageSquare, Eye, MoreHorizontal, Pin, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RoleBadge } from "./role-badge";
import type { ForumThread } from "@/payload-types";
import { api } from "@/trpc/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const categoryStyles: Record<string, string> = {
  general: "text-zinc-500 border-zinc-200",
  question: "text-blue-600 border-blue-200 bg-blue-50",
  showcase: "text-purple-600 border-purple-200 bg-purple-50",
  job: "text-green-600 border-green-200 bg-green-50",
};

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type ThreadCardProps = {
  thread: ForumThread;
  index: number;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
};

export function ThreadCard({ thread, index, memberRole }: ThreadCardProps) {
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
      <Link href={`/forum/${thread.slug}`}>
        <m.div
          className="mb-3 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-snug font-medium text-zinc-900">
              {thread.isPinned && (
                <span className="mr-1 font-mono text-[9px] text-orange-600">
                  PIN
                </span>
              )}
              {thread.title}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {thread.isLocked && <Lock className="h-3 w-3 text-zinc-400" />}
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${categoryStyles[thread.category]}`}
              >
                {t(thread.category)}
              </span>
              {canModerate && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="rounded p-1 hover:bg-zinc-100"
                    onClick={(e) => e.preventDefault()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
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
            <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-400">
              <MessageSquare className="h-2.5 w-2.5" />
              {t("replies", { count: thread.replyCount ?? 0 })}
            </span>
            {(thread.viewCount ?? 0) > 0 && (
              <span className="hidden items-center gap-1 font-mono text-[9px] text-zinc-400 sm:flex">
                <Eye className="h-2.5 w-2.5" />
                {t("views", { count: thread.viewCount ?? 0 })}
              </span>
            )}
            <span className="font-mono text-[9px] text-zinc-400">
              {timeAgo(thread.lastActivityAt)}
            </span>
            {thread.authorName && (
              <span className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-400">
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
