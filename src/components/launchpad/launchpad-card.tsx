"use client";

import { LazyMotion, domAnimation, m } from "framer-motion";
import { ChevronUp, MessageSquare, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
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

const stageStripeColors: Record<string, string> = {
  idea: "bg-zinc-200",
  prototype: "bg-blue-200",
  mvp: "bg-amber-200",
  launched: "bg-green-200",
};

function getCoverUrl(
  coverImage: LaunchpadCardProps["project"]["coverImage"],
): string | null {
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
        className="flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-border hover:shadow-sm"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
      >
        {/* Cover image or colored stripe */}
        {coverUrl ? (
          <div className="relative h-36 w-full overflow-hidden bg-muted">
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
        <Link
          href={`/launchpad/${project.slug}`}
          className="flex flex-1 flex-col gap-2 p-4"
        >
          {/* Stage badge + author */}
          <div className="flex items-center justify-between gap-2">
            {/* Stage is a categorical attribute, not a status → neutral Badge. */}
            <Badge
              className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase"
              variant="secondary"
            >
              {t(
                `stage.${project.stage as "idea" | "prototype" | "mvp" | "launched"}`,
              )}
            </Badge>
            {project.authorName && (
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {project.authorName}
              </span>
            )}
          </div>

          {/* Title */}
          <p className="line-clamp-2 text-sm leading-snug font-semibold text-foreground">
            {project.title}
          </p>

          {/* Tags */}
          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.tags.slice(0, 4).map((t, i) => (
                <span
                  key={t.id ?? i}
                  className="rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[9px] text-muted-foreground"
                >
                  {t.tag}
                </span>
              ))}
            </div>
          )}
        </Link>

        {/* Footer row — vote button + stats */}
        <div className="flex items-center gap-3 border-t border-border px-4 py-2">
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
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ChevronUp className="h-3 w-3" />
            {project.voteCount ?? 0}
          </button>

          <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <MessageSquare className="h-2.5 w-2.5" />
            {project.commentCount ?? 0}
          </span>

          <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {project.createdAt && (
              <RelativeTime
                date={project.createdAt}
                className="text-[10px] text-muted-foreground"
              />
            )}
          </span>
        </div>
      </m.div>
    </LazyMotion>
  );
}
