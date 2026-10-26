import { useTranslations } from "next-intl";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { magazinePath, magazineSettingsPath } from "@/lib/magazines/paths";
import type {
  CommunityMagazineTabData,
  IssueCard,
} from "@/server/magazines/reading";

import { EditorDesk } from "../editor/editor-desk";
import { FeaturedIssue } from "../reading/featured-issue";
import { IssueCoverCard } from "../reading/issue-cover-card";

/** A community without a magazine, as its editors see it (preflight F8). */
function StartMagazine({ communitySlug }: { communitySlug: string }) {
  const t = useTranslations("magazineEditor.tab");
  return (
    <EmptyState
      className="rounded-lg border"
      title={t("startTitle")}
      description={t("startDescription")}
      action={
        <Button variant="ink" size="sm" asChild>
          <Link href={magazineSettingsPath(communitySlug)}>{t("start")}</Link>
        </Button>
      }
    />
  );
}

/** Older published issues as a shelf of covers, newest first. */
function PastIssues({ issues }: { issues: IssueCard[] }) {
  const t = useTranslations("magazineEditor.tab");
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-5">
      <SectionLabel id={labelId}>{t("pastIssues")}</SectionLabel>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6">
        {issues.map((issue) => (
          <li key={issue.id} className="min-w-0">
            <IssueCoverCard
              issue={issue}
              badge={
                // The effective value (preflight F10), as on the shelf.
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
    </section>
  );
}

/**
 * The community's Magazine tab (spec flow 5): the latest issue large with
 * the page's one orange action, "Read the issue", then the archive shelf
 * of older covers. Editors also get the editor desk. Server-rendered from
 * `loadCommunityMagazineTab`; a community without a magazine reaches this
 * only for editors (the page answers 404 for everyone else).
 *
 * Columns follow the tab's own width (`@container`), not the screen's: the
 * community rail takes part of the screen.
 */
export function MagazineTab({
  data,
  communitySlug,
}: {
  data: CommunityMagazineTabData;
  communitySlug: string;
}) {
  const t = useTranslations("magazineEditor.tab");
  const latestId = useId();
  const { magazine, latest, issues, viewerIsEditor } = data;

  if (!magazine) {
    return viewerIsEditor ? (
      <StartMagazine communitySlug={communitySlug} />
    ) : null;
  }

  const past = latest
    ? issues.filter((issue) => issue.id !== latest.id)
    : issues;

  return (
    <div className="@container flex flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-balance break-words">
            {magazine.name}
          </h2>
          {magazine.description && (
            <p className="text-muted-foreground max-w-[72ch] text-sm leading-relaxed">
              {magazine.description}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={magazinePath(magazine)}>{t("magazinePage")}</Link>
        </Button>
      </header>

      {latest ? (
        <section aria-labelledby={latestId}>
          <FeaturedIssue
            issue={latest}
            labelId={latestId}
            label={t("latest")}
            showCommunity={false}
          />
        </section>
      ) : (
        <EmptyState
          className="rounded-lg border"
          title={t("emptyTitle")}
          description={
            viewerIsEditor
              ? t("emptyEditorDescription")
              : t("emptyDescription", { magazine: magazine.name })
          }
        />
      )}

      {viewerIsEditor && <EditorDesk slug={communitySlug} />}

      {past.length > 0 && <PastIssues issues={past} />}
    </div>
  );
}
