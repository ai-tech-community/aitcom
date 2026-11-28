import { ArrowDown, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { magazinePath, magazineSettingsPath } from "@/lib/magazines/paths";
import { roleCan, type MagazineRole } from "@/lib/magazines/roles";
import type { IssueStatus } from "@/lib/magazines/values";
import type {
  CommunityMagazineTabData,
  IssueCard,
} from "@/server/magazines/reading";

import { ContributorDesk } from "../editor/contributor-desk";
import { EditorDesk } from "../editor/editor-desk";
import { FeaturedIssue } from "../reading/featured-issue";
import { IssueCoverCard } from "../reading/issue-cover-card";
import { IssueVisibilityBadge } from "../reading/issue-visibility-badge";
import { SubscribeButton } from "../reading/subscribe-button";

/** Desk choice follows capabilities, so role changes stay in roles.ts. */
function deskFor(role: MagazineRole | null): "edit" | "write" | null {
  if (roleCan(role, "edit")) return "edit";
  if (roleCan(role, "write")) return "write";
  return null;
}

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

function unpublishedStatus(status: IssueStatus): "draft" | "scheduled" | null {
  switch (status) {
    case "draft":
    case "scheduled":
      return status;
    case "published":
      return null;
  }
}

/**
 * Unpublished issues for an editor, labelled by status. Readers never get
 * this list. Covers still open the issue (editors can read a draft); the
 * desk below is where they edit it.
 */
function DraftIssues({ issues }: { issues: IssueCard[] }) {
  const t = useTranslations("magazineEditor.tab");
  const labelId = useId();
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-5">
      <SectionLabel id={labelId}>{t("drafts")}</SectionLabel>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6">
        {issues.map((issue) => {
          const status = unpublishedStatus(issue.status);
          return (
            <li key={issue.id} className="min-w-0">
              <IssueCoverCard
                issue={issue}
                badge={
                  status ? (
                    <Badge variant="secondary" className="font-normal">
                      {status === "draft"
                        ? t("status.draft")
                        : t("status.scheduled")}
                    </Badge>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
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
                <IssueVisibilityBadge visibility={issue.effectiveVisibility} />
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
 * "Read the issue" in ink (the community frame's Join is this page's one
 * orange action, One Voice Rule), then the archive shelf
 * of older covers. Writers get their desk, chosen by capability. Server-rendered from
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
  const deskId = useId();
  const tEditor = useTranslations("magazineEditor");
  const { magazine, latest, issues, viewerIsEditor, viewerRole, draftIssues } =
    data;

  if (!magazine) {
    return viewerIsEditor ? (
      <StartMagazine communitySlug={communitySlug} />
    ) : null;
  }

  const desk = deskFor(viewerRole);
  const past = latest
    ? issues.filter((issue) => issue.id !== latest.id)
    : issues;

  return (
    <div className="@container flex min-w-0 flex-col gap-7 @3xl:gap-9">
      <header className="flex min-w-0 flex-col gap-2">
        <h2 className="font-community-heading text-3xl leading-tight font-semibold tracking-tight text-balance break-words @2xl:text-4xl">
          {magazine.name}
        </h2>
        {magazine.description && (
          <p className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed break-words @2xl:text-base">
            {magazine.description}
          </p>
        )}
      </header>

      {latest ? (
        <section aria-labelledby={latestId}>
          <FeaturedIssue
            issue={latest}
            labelId={latestId}
            label={t("latest")}
            variant="community"
          />
        </section>
      ) : viewerIsEditor && draftIssues.length > 0 ? null : (
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

      <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-3 border-b pb-5">
        <Button variant="outline" size="sm" asChild>
          <Link href={magazinePath(magazine)}>
            {t("magazinePage")}
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
        <SubscribeButton
          magazineSlug={magazine.slug}
          magazineName={magazine.name}
        />
        {desk && (
          <a
            href={`#${deskId}`}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1.5 text-sm underline underline-offset-4"
          >
            {desk === "edit"
              ? tEditor("desk.label")
              : tEditor("contributorDesk.label")}
            <ArrowDown aria-hidden="true" className="size-3.5" />
          </a>
        )}
      </div>

      {past.length > 0 && <PastIssues issues={past} />}

      {viewerIsEditor && draftIssues.length > 0 && (
        <DraftIssues issues={draftIssues} />
      )}

      {desk && (
        <div id={deskId} tabIndex={-1} className="scroll-mt-24">
          {desk === "edit" ? (
            <EditorDesk
              slug={communitySlug}
              canManage={roleCan(viewerRole, "manage")}
            />
          ) : (
            <ContributorDesk slug={communitySlug} />
          )}
        </div>
      )}
    </div>
  );
}
