"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { MessageSquare, Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RoleBadge } from "./role-badge";
import type { ForumThread } from "@/payload-types";

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
};

export function ThreadCard({ thread, index }: ThreadCardProps) {
  const t = useTranslations("forum");

  return (
    <LazyMotion features={domAnimation}>
      <Link href={`/forum/${thread.slug}`}>
        <m.div
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 mb-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.03 }}
        >
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-zinc-900">
            {thread.isPinned && (
              <span className="mr-1 font-mono text-[9px] text-orange-600">
                PIN
              </span>
            )}
            {thread.title}
          </p>
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${categoryStyles[thread.category]}`}
          >
            {t(thread.category)}
          </span>
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
