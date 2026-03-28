"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { ChevronUp, MessageSquare, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";

type LaunchpadCardProps = {
  project: {
    id: number;
    title: string;
    slug: string;
    stage: string;
    tags?: Array<{ tag: string; id?: string | null }> | null;
    coverImage?: { url?: string | null } | number | null;
    authorName?: string | null;
    voteCount?: number | null;
    commentCount?: number | null;
    hasVoted: boolean;
    createdAt: string;
  };
  index: number;
};

const stageStyles: Record<string, string> = {
  idea: "bg-zinc-100 text-zinc-600 border-zinc-200",
  prototype: "bg-blue-50 text-blue-600 border-blue-200",
  mvp: "bg-amber-50 text-amber-600 border-amber-200",
  launched: "bg-green-50 text-green-600 border-green-200",
};

const stageStripeColors: Record<string, string> = {
  idea: "bg-zinc-200",
  prototype: "bg-blue-200",
  mvp: "bg-amber-200",
  launched: "bg-green-200",
};

function timeAgo(date: string | null | undefined): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getCoverUrl(coverImage: LaunchpadCardProps["project"]["coverImage"]): string | null {
  if (!coverImage) return null;
  if (typeof coverImage === "object" && coverImage.url) return coverImage.url;
  return null;
}

export function LaunchpadCard({ project, index }: LaunchpadCardProps) {
  const t = useTranslations("launchpad");
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();

  const listInput = {
    sort: "newest" as const,
    stage: "all" as const,
  };

  const voteMutation = api.launchpad.vote.useMutation({
    onMutate: async ({ projectId }) => {
      await utils.launchpad.list.cancel();
      const prev = utils.launchpad.list.getData(listInput);
      utils.launchpad.list.setData(listInput, (old) => {
        if (!old) return old;
        return {
          ...old,
          projects: old.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  hasVoted: !p.hasVoted,
                  voteCount: p.hasVoted
                    ? (p.voteCount ?? 0) - 1
                    : (p.voteCount ?? 0) + 1,
                }
              : p,
          ),
        };
      });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) utils.launchpad.list.setData(listInput, ctx.prev);
      if (err.message === "RULES_NOT_ACCEPTED") {
        toast.error(t("vote.signInToVote"));
      }
    },
    onSettled: () => void utils.launchpad.list.invalidate(),
  });

  const coverUrl = getCoverUrl(project.coverImage);

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        className="flex flex-col rounded-lg border border-zinc-200 bg-white overflow-hidden transition-colors hover:border-zinc-300 hover:shadow-sm"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
      >
        {/* Cover image or colored stripe */}
        {coverUrl ? (
          <div className="relative h-36 w-full overflow-hidden bg-zinc-100">
            <Image
              src={coverUrl}
              alt={project.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div
            className={`h-2 w-full ${stageStripeColors[project.stage] ?? "bg-zinc-200"}`}
          />
        )}

        {/* Card body — wrapped in Link */}
        <Link href={`/launchpad/${project.slug}`} className="flex flex-col flex-1 p-4 gap-2">
          {/* Stage badge + author */}
          <div className="flex items-center justify-between gap-2">
            <Badge
              className={`font-mono text-[9px] font-semibold uppercase tracking-wider rounded border px-1.5 py-0.5 ${stageStyles[project.stage] ?? stageStyles.idea}`}
              variant="outline"
            >
              {t(`stage.${project.stage as "idea" | "prototype" | "mvp" | "launched"}`)}
            </Badge>
            {project.authorName && (
              <span className="font-mono text-[10px] text-zinc-400 truncate">
                {project.authorName}
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold leading-snug text-zinc-900 line-clamp-2">
            {project.title}
          </p>

          {/* Tags */}
          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.tags.slice(0, 4).map((t, i) => (
                <span
                  key={t.id ?? i}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[9px] text-zinc-500"
                >
                  {t.tag}
                </span>
              ))}
            </div>
          )}
        </Link>

        {/* Footer row — vote button + stats */}
        <div className="flex items-center gap-3 border-t border-zinc-100 px-4 py-2">
          {/* Vote button — outside the Link to prevent nested anchors */}
          <button
            onClick={(e) => {
              e.preventDefault();
              if (!session?.user) {
                toast.info(t("vote.signInToVote"));
                return;
              }
              voteMutation.mutate({ projectId: project.id });
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold transition-colors ${
              project.hasVoted
                ? "bg-orange-50 text-orange-600"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <ChevronUp className="h-3 w-3" />
            {project.voteCount ?? 0}
          </button>

          <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
            <MessageSquare className="h-2.5 w-2.5" />
            {project.commentCount ?? 0}
          </span>

          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-zinc-400">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(project.createdAt)}
          </span>
        </div>
      </m.div>
    </LazyMotion>
  );
}
