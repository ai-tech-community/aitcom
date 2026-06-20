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
import { useRequireAuth } from "@/components/auth/auth-required-dialog";

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

// Stage is a categorical attribute, not a status — the stage Badge below
// carries the meaning, so the cover-fallback stripe stays neutral rather than
// color-coding the category (DESIGN.md Semantic-Status Rule).
const STAGE_STRIPE = "bg-muted";

function getCoverUrl(
  coverImage: LaunchpadCardProps["project"]["coverImage"],
): string | null {
  if (!coverImage) return null;
  if (typeof coverImage === "object" && coverImage.url) return coverImage.url;
  return null;
}

export function LaunchpadCard({ project, index }: LaunchpadCardProps) {
  const t = useTranslations("launchpad");
  const { requireAuth } = useRequireAuth();
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
        className="border-border bg-card hover:border-border flex flex-col overflow-hidden rounded-lg border transition-colors hover:shadow-sm"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
      >
        {/* Cover image or colored stripe */}
        {coverUrl ? (
          <div className="bg-muted relative h-36 w-full overflow-hidden">
            <Image
              src={coverUrl}
              alt={project.title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        ) : (
          <div className={`h-2 w-full ${STAGE_STRIPE}`} />
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
              className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider uppercase"
              variant="secondary"
            >
              {t(
                `stage.${project.stage as "idea" | "prototype" | "mvp" | "launched"}`,
              )}
            </Badge>
            {project.authorName && (
              <span className="text-muted-foreground truncate font-mono text-xs">
                {project.authorName}
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-foreground line-clamp-2 text-sm leading-snug font-semibold">
            {project.title}
          </p>

          {/* Tags */}
          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {project.tags.slice(0, 4).map((t, i) => (
                <span
                  key={t.id ?? i}
                  className="border-border bg-muted text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-xs"
                >
                  {t.tag}
                </span>
              ))}
            </div>
          )}
        </Link>

        {/* Footer row — vote button + stats */}
        <div className="border-border flex items-center gap-3 border-t px-4 py-2">
          {/* Vote button — outside the Link to prevent nested anchors */}
          <button
            onClick={(e) => {
              e.preventDefault();
              requireAuth(
                () => voteMutation.mutate({ projectId: project.id }),
                "Sign in to upvote projects",
              );
            }}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-xs font-semibold transition-colors ${
              project.hasVoted
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ChevronUp className="h-3 w-3" />
            {project.voteCount ?? 0}
          </button>

          <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
            <MessageSquare className="h-2.5 w-2.5" />
            {project.commentCount ?? 0}
          </span>

          <span className="text-muted-foreground ml-auto flex items-center gap-1 font-mono text-xs">
            <Clock className="h-2.5 w-2.5" />
            {project.createdAt && (
              <RelativeTime
                date={project.createdAt}
                className="text-muted-foreground text-xs"
              />
            )}
          </span>
        </div>
      </m.div>
    </LazyMotion>
  );
}
