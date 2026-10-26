import { useTranslations } from "next-intl";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import {
  communityMagazinePath,
  magazinesTopicPath,
} from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";
import type { MagazineShelfData } from "@/server/magazines/reading";

import { IssueCoverCard } from "./issue-cover-card";
import { READING_FRAME } from "./frame";

function communityPath(slug: string): string {
  return `/communities/${slug}`;
}

/** The magazine's logo, or nothing: the name carries the identity. */
function MagazineLogo({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    // Any host an editor links to: next/image only serves listed hosts.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="bg-secondary size-16 shrink-0 rounded-lg border object-cover"
    />
  );
}

function MagazineIdentity({ data }: { data: MagazineShelfData }) {
  const t = useTranslations("magazines.shelf");
  const { magazine, community, viewerIsEditor } = data;
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <MagazineLogo url={magazine.logoUrl} />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance break-words sm:text-4xl">
            {magazine.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t.rich("byCommunity", {
              community: community.name,
              link: (chunks) => (
                <Link
                  href={communityPath(community.slug)}
                  className="text-foreground font-medium underline-offset-4 hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
      {magazine.description && (
        <p className="max-w-[72ch] text-base leading-relaxed">
          {magazine.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
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
 */
export function MagazineShelf({ data }: { data: MagazineShelfData }) {
  const t = useTranslations("magazines.shelf");
  const issuesId = useId();
  const { magazine, community, issues, viewerIsEditor } = data;

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
                    issue.effectiveVisibility === "members" ? (
                      <Badge variant="outline" className="font-normal">
                        {t("membersOnly")}
                      </Badge>
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={t("emptyTitle")}
            description={
              viewerIsEditor
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
