"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp, ExternalLink, Edit, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { LexicalRenderer } from "@/lib/lexical";
import { LaunchpadTimeline } from "@/components/launchpad/launchpad-timeline";
import { LaunchpadComments } from "@/components/launchpad/launchpad-comments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stageStyles: Record<string, string> = {
  idea: "bg-zinc-100 text-zinc-600 border-zinc-200",
  prototype: "bg-blue-50 text-blue-600 border-blue-200",
  mvp: "bg-amber-50 text-amber-600 border-amber-200",
  launched: "bg-green-50 text-green-600 border-green-200",
};

function getCoverUrl(
  coverImage: { url?: string | null } | number | null | undefined,
): string | null {
  if (!coverImage) return null;
  if (typeof coverImage === "object" && coverImage.url) return coverImage.url;
  return null;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-6 px-4 py-10 sm:px-6">
      <div className="h-4 w-24 rounded bg-zinc-200" />
      <div className="h-8 w-2/3 rounded bg-zinc-200" />
      <div className="flex gap-3">
        <div className="h-6 w-20 rounded bg-zinc-200" />
        <div className="h-6 w-32 rounded bg-zinc-200" />
      </div>
      <div className="h-48 w-full rounded bg-zinc-100" />
      <div className="space-y-2">
        <div className="h-4 rounded bg-zinc-100" />
        <div className="h-4 w-5/6 rounded bg-zinc-100" />
        <div className="h-4 w-4/6 rounded bg-zinc-100" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LaunchpadDetail
// ---------------------------------------------------------------------------

export function LaunchpadDetail({ slug }: { slug: string }) {
  const t = useTranslations("launchpad");
  const tDetail = useTranslations("launchpad.detail");
  const { data: session } = authClient.useSession();

  const { data: project, isPending, isError } = api.launchpad.getBySlug.useQuery({ slug });

  const utils = api.useUtils();
  const voteMutation = api.launchpad.vote.useMutation({
    onMutate: async () => {
      await utils.launchpad.getBySlug.cancel({ slug });
      const prev = utils.launchpad.getBySlug.getData({ slug });
      if (prev) {
        utils.launchpad.getBySlug.setData({ slug }, {
          ...prev,
          hasVoted: !prev.hasVoted,
          voteCount: prev.hasVoted ? (prev.voteCount ?? 0) - 1 : (prev.voteCount ?? 0) + 1,
        });
      }
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) utils.launchpad.getBySlug.setData({ slug }, ctx.prev);
    },
    onSettled: () => void utils.launchpad.getBySlug.invalidate({ slug }),
  });

  if (isPending) return <DetailSkeleton />;

  if (isError || !project) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <p className="font-mono text-sm text-zinc-400">{tDetail("notFound")}</p>
        <Link
          href="/launchpad"
          className="mt-4 inline-block font-mono text-xs tracking-wider text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
        >
          {tDetail("backToLaunchpad")}
        </Link>
      </div>
    );
  }

  const currentUserId = session?.user?.id;
  const isAuthor = !!currentUserId && currentUserId === project.authorId;
  const coverUrl = getCoverUrl(
    project.coverImage as { url?: string | null } | number | null | undefined,
  );

  const links = Array.isArray(project.links)
    ? (project.links as Array<{ label: string; url: string; id?: string }>)
    : [];

  const authorLevel = project.authorProfile?.level ?? null;
  const authorDisplayName =
    project.authorProfile?.displayName ?? project.authorName ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Back link */}
      <Link
        href="/launchpad"
        className="font-mono text-xs tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
      >
        &larr; {tDetail("backToLaunchpad")}
      </Link>

      {/* Archived banner */}
      {project.status === "archived" && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
          <Archive className="h-4 w-4 shrink-0 text-zinc-400" />
          <p className="font-mono text-xs text-zinc-500">{tDetail("archived")}</p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-6 space-y-3">
        {/* Stage badge + edit link */}
        <div className="flex items-center justify-between gap-3">
          <Badge
            className={`font-mono text-[9px] font-semibold uppercase tracking-wider rounded border px-1.5 py-0.5 ${stageStyles[project.stage] ?? stageStyles.idea}`}
            variant="outline"
          >
            {t(`stage.${project.stage}`)}
          </Badge>
          {isAuthor && (
            <Link
              href={`/launchpad/${slug}/edit`}
              className="flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:bg-zinc-100"
            >
              <Edit className="h-3 w-3" />
              {tDetail("editProject")}
            </Link>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
          {project.title}
        </h1>

        {/* Author info + vote */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Author */}
          {authorDisplayName && (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-zinc-500">
                {authorDisplayName}
              </span>
              {authorLevel !== null && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-zinc-500">
                  Lv {authorLevel}
                </span>
              )}
            </div>
          )}

          {/* Vote button */}
          <button
            onClick={() => {
              if (!session?.user) return;
              voteMutation.mutate({ projectId: project.id });
            }}
            disabled={voteMutation.isPending}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[11px] font-bold transition-colors disabled:opacity-60 ${
              project.hasVoted
                ? "bg-orange-50 text-orange-600"
                : "text-zinc-400 hover:text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
            }`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
            {project.voteCount ?? 0}
          </button>
        </div>

        {/* External links */}
        {links.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {links.map((link, i) => (
              <a
                key={link.id ?? i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 font-mono text-[10px] text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-white"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Cover image                                                         */}
      {/* ------------------------------------------------------------------ */}
      {coverUrl && (
        <div className="relative mt-8 h-56 w-full overflow-hidden rounded-lg bg-zinc-100 sm:h-72">
          <Image
            src={coverUrl}
            alt={project.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            priority
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Pitch                                                               */}
      {/* ------------------------------------------------------------------ */}
      {project.pitch && (
        <div className="mt-8">
          <h2 className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            {tDetail("pitch")}
          </h2>
          <LexicalRenderer content={project.pitch} />
        </div>
      )}

      <Separator className="my-10" />

      {/* ------------------------------------------------------------------ */}
      {/* Timeline                                                            */}
      {/* ------------------------------------------------------------------ */}
      <LaunchpadTimeline
        projectId={project.id}
        updates={project.updates ?? []}
        isAuthor={isAuthor}
      />

      <Separator className="my-10" />

      {/* ------------------------------------------------------------------ */}
      {/* Comments                                                            */}
      {/* ------------------------------------------------------------------ */}
      <LaunchpadComments
        projectId={project.id}
        comments={project.comments ?? []}
        currentUserId={currentUserId}
      />
    </div>
  );
}
