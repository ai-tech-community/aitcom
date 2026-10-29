import { useId, type ReactNode } from "react";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/messages";
import { Link } from "@/i18n/navigation";
import { readingModeOf, seesEditorLayer } from "@/lib/magazines/access";
import { issueBuilderPath, magazineArticlePath } from "@/lib/magazines/paths";
import type { IssueStatus } from "@/lib/magazines/values";
import type { IssuePageData } from "@/server/magazines/reading";

import type { ItemTeaser } from "../items/types";
import { LAYOUTS } from "../layouts/registry";
import { IssueContents } from "./issue-contents";
import { hasEditorNote } from "./issue-hero";
import { IssueEditorialHero } from "./issue-editorial-hero";
import { MagazineShell } from "./magazine-shell";
import { IssueRail } from "./issue-rail";
import {
  MagazineJoinPrompt,
  MagazineJoinPromptProvider,
} from "./magazine-join-prompt";
import { ReadTracker } from "./read-tracker";

function NoItems() {
  const t = useTranslations("magazines.issue");
  return <p className="text-muted-foreground text-sm">{t("noItems")}</p>;
}

const NOTICE: Record<IssueStatus, "draftNotice" | "scheduledNotice" | null> = {
  draft: "draftNotice",
  scheduled: "scheduledNotice",
  published: null,
};

/** Editors only: the issue builder link and a note until readers can see it. */
function EditorBar({
  status,
  communitySlug,
  issueId,
}: {
  status: IssueStatus;
  communitySlug: string;
  issueId: number;
}) {
  const t = useTranslations("magazines.issue");
  const notice = NOTICE[status];
  return (
    <div className="bg-secondary/60 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5">
      <p className="text-muted-foreground text-sm">
        {notice ? t(notice) : null}
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link href={issueBuilderPath(communitySlug, issueId)}>
          {t("editIssue")}
        </Link>
      </Button>
    </div>
  );
}

/**
 * The editorial issue: its own publication shell, cover-led opening,
 * contents and existing item layout, followed by publication information.
 */
export function IssueReader({
  data,
  url,
}: {
  data: IssuePageData;
  url: string;
  /** Kept for parity with the other reading views; formatting follows the intl provider. */
  locale: AppLocale;
}) {
  const { access, magazine, community, issue, items, pastIssues } = data;
  const titleId = useId();
  const mode = readingModeOf(access);
  const source = {
    via: "magazine",
    magazineId: magazine.id,
    issueId: issue.id,
  } as const;
  let teaser: ItemTeaser | null;
  let joinPanel: ReactNode;
  switch (mode) {
    case "full":
      teaser = null;
      joinPanel = null;
      break;
    case "teaser":
      teaser = {
        inlinePrompt: (
          <MagazineJoinPrompt
            variant="inline"
            community={community}
            source={source}
            focusTargetId={titleId}
          />
        ),
      };
      joinPanel = (
        <MagazineJoinPrompt
          variant="panel"
          community={community}
          source={source}
          focusTargetId={titleId}
        />
      );
      break;
  }
  const Layout = LAYOUTS[issue.layout];
  const href = (articleSlug: string) =>
    magazineArticlePath(magazine, issue, { slug: articleSlug });
  const showNote = hasEditorNote(issue.editorNote);

  const reading = (
    <MagazineShell magazine={magazine} community={community} issue={issue}>
      <div className="magazine-page">
        <ReadTracker
          key={issue.id}
          issueId={issue.id}
          enabled={!seesEditorLayer(access)}
          trackEnd={false}
        />
        <article className="@container min-w-0">
          {seesEditorLayer(access) && (
            <div className="magazine-editor-actions">
              <EditorBar
                status={issue.status}
                communitySlug={community.slug}
                issueId={issue.id}
              />
            </div>
          )}
          <IssueEditorialHero issue={issue} titleId={titleId} />
          {joinPanel && <div className="magazine-join-panel">{joinPanel}</div>}
          <section id="issue-contents" className="magazine-issue-contents">
            <IssueContents
              items={items}
              hasEditorNote={showNote}
              readingMinutes={data.readingMinutes}
            />
          </section>
          <div className="magazine-stories">
            <Layout items={items} href={href} teaser={teaser} />
          </div>
          {items.length === 0 && <NoItems />}
        </article>
        <aside className="magazine-about">
          <IssueRail
            issue={issue}
            magazine={magazine}
            community={community}
            pastIssues={pastIssues}
            joinPanel={null}
            url={url}
          />
        </aside>
      </div>
    </MagazineShell>
  );
  // The provider stays mounted in both modes: a join refreshes the page from
  // preview to full, and swapping the wrapper would remount the whole view,
  // dropping keyboard focus from the heading the join just moved it to.
  return (
    <MagazineJoinPromptProvider
      community={community}
      source={source}
      focusTargetId={titleId}
      finishJoin={mode === "teaser"}
    >
      {reading}
    </MagazineJoinPromptProvider>
  );
}
