import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  communityMagazinePath,
  issuePath,
  magazinesTopicPath,
} from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";
import type { MagazineShelfData } from "@/server/magazines/reading";

import { IssueCoverCard } from "./issue-cover-card";
import { READING_FRAME } from "./frame";
import { IssueVisibilityBadge } from "./issue-visibility-badge";
import { SubscribeButton } from "./subscribe-button";

function communityPath(slug: string): string {
  return `/communities/${slug}`;
}

/** The magazine's logo, or nothing: the name carries the identity. */
function MagazineLogo({
  url,
  alt,
}: {
  url: string | null;
  alt: string | null;
}) {
  if (!url) return null;
  return (
    // Any host an editor links to: next/image only serves listed hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? ""}
      data-magazine-logo=""
      className="bg-card size-12 shrink-0 rounded-lg border object-contain sm:size-16"
    />
  );
}

function MagazineIdentity({ data }: { data: MagazineShelfData }) {
  const t = useTranslations("magazines.shelf");
  const { magazine, community, viewerIsEditor, issues } = data;
  const latest = issues[0];
  return (
    <header className="flex flex-col gap-5">
      <div
        className={cn(
          "grid items-center gap-5 sm:gap-8",
          magazine.coverImageUrl &&
            "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        <div className="flex min-w-0 flex-col items-start gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <MagazineLogo
              url={magazine.logoUrl}
              alt={magazine.logoAlt ?? null}
            />
            <div className="min-w-0 space-y-2">
              <h1 className="magazine-display text-4xl leading-none font-medium tracking-tight text-balance break-words sm:text-6xl lg:text-7xl">
                {magazine.name}
              </h1>
              <p className="text-muted-foreground text-sm break-words">
                {t.rich("byCommunity", {
                  community: community.name,
                  link: (chunks) => (
                    <Link
                      href={communityPath(community.slug)}
                      className="text-foreground decoration-border font-medium underline underline-offset-4 hover:decoration-current"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </div>
          {magazine.description && (
            <p className="max-w-[65ch] text-base leading-relaxed break-words">
              {magazine.description}
            </p>
          )}
          {latest && (
            <Button asChild>
              <Link href={issuePath(magazine, latest)}>{t("readLatest")}</Link>
            </Button>
          )}
        </div>
        {magazine.coverImageUrl && (
          // Editors may host publication covers on any image host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={magazine.coverImageUrl}
            alt={magazine.coverAlt ?? ""}
            data-magazine-cover=""
            className="bg-secondary aspect-[3/1] w-full rounded-xl border object-cover md:aspect-[2/1]"
          />
        )}
      </div>
      <div className="flex flex-wrap items-start gap-3 border-t pt-4">
        {magazine.topics.length > 0 && (
          <ul aria-label={t("topics")} className="flex flex-wrap gap-2">
            {magazine.topics.map((topic) => (
              <li key={topic}>
                <Link
                  href={magazinesTopicPath(topic)}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-7 items-center rounded-full border px-3 text-xs transition-colors"
                >
                  {topic}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <SubscribeButton
          magazineSlug={magazine.slug}
          magazineName={magazine.name}
        />
        {viewerIsEditor && (
          <Button variant="outline" size="sm" asChild className="ml-auto">
            <Link href={communityMagazinePath(community.slug)}>
              {t("manage")}
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

/**
 * `/magazines/[magazine]` (DESIGN.md frame exception for the magazines
 * home and shelf): who makes the magazine, then every published issue the
 * viewer may read, newest first. Members-only issues (by their effective
 * visibility, preflight F10) carry a neutral "Members only" badge, so a
 * member knows which issues they cannot share with outsiders.
 *
 * Drafts stay off this page. When the viewer edits the magazine and the
 * only issues are drafts, the empty state says so and points at the
 * Magazine tab instead of claiming there are no issues.
 */
export function MagazineShelf({ data }: { data: MagazineShelfData }) {
  const t = useTranslations("magazines.shelf");
  const issuesId = useId();
  const { magazine, community, issues, viewerIsEditor, unpublishedForEditor } =
    data;
  const editorWithDrafts = viewerIsEditor && unpublishedForEditor;

  return (
    <div className={cn(READING_FRAME, "flex flex-col gap-10")}>
      <MagazineIdentity data={data} />

      <section aria-labelledby={issuesId} className="flex flex-col gap-5">
        <SectionLabel id={issuesId}>{t("issues")}</SectionLabel>
        {issues.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {issues.map((issue) => (
              <li key={issue.id} className="min-w-0">
                <IssueCoverCard
                  issue={issue}
                  badge={
                    <IssueVisibilityBadge
                      visibility={issue.effectiveVisibility}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={
              editorWithDrafts
                ? t("emptyEditorWithDraftsTitle")
                : t("emptyTitle")
            }
            description={
              editorWithDrafts
                ? t("emptyEditorWithDraftsDescription")
                : viewerIsEditor
                  ? t("emptyEditorDescription")
                  : t("emptyDescription", { magazine: magazine.name })
            }
            action={
              viewerIsEditor ? (
                <Button variant="ink" size="sm" asChild>
                  <Link href={communityMagazinePath(community.slug)}>
                    {t("manage")}
                  </Link>
                </Button>
              ) : (
                <Button variant="ink" size="sm" asChild>
                  <Link href={communityPath(community.slug)}>
                    {t("visitCommunity", { community: community.name })}
                  </Link>
                </Button>
              )
            }
          />
        )}
      </section>
    </div>
  );
}
