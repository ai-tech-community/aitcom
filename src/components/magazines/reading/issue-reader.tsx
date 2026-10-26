import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/messages";
import { Link } from "@/i18n/navigation";
import { seesEditorLayer } from "@/lib/magazines/access";
import { issueBuilderPath, magazineArticlePath } from "@/lib/magazines/paths";
import type { IssuePageData } from "@/server/magazines/reading";

import { LAYOUTS } from "../layouts/registry";
import { READING_FRAME } from "./frame";
import { IssueContents } from "./issue-contents";
import { hasEditorNote, IssueHero } from "./issue-hero";
import { IssueRail } from "./issue-rail";

function NoItems() {
  const t = useTranslations("magazines.issue");
  return <p className="text-muted-foreground text-sm">{t("noItems")}</p>;
}

/** Editors only: the issue builder link, and a quiet note on a draft. */
function EditorBar({
  draft,
  communitySlug,
  issueId,
}: {
  draft: boolean;
  communitySlug: string;
  issueId: number;
}) {
  const t = useTranslations("magazines.issue");
  return (
    <div className="bg-secondary/60 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5">
      <p className="text-muted-foreground text-sm">
        {draft ? t("draftNotice") : null}
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
 * The issue reading view (mockup screen 2, DESIGN.md frame exception for
 * the issue reading view): sticky contents, the hero (cover beside the
 * editor's note) above the issue's layout, and the rail. Phones get one column with
 * the contents first; from `lg` the contents sit beside the issue and the
 * rail drops below it; from `xl` all three columns show.
 */
export function IssueReader({
  data,
}: {
  data: IssuePageData;
  /** Kept for parity with the other reading views; formatting follows the intl provider. */
  locale: AppLocale;
}) {
  const { access, magazine, community, issue, items, pastIssues } = data;
  const Layout = LAYOUTS[issue.layout];
  const href = (articleSlug: string) =>
    magazineArticlePath(magazine, issue, { slug: articleSlug });
  const showNote = hasEditorNote(issue.editorNote);

  return (
    <div className={READING_FRAME}>
      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_18rem]">
        <aside className="lg:sticky lg:top-24 lg:row-span-2 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain xl:row-span-1">
          <IssueContents
            items={items}
            hasEditorNote={showNote}
            readingMinutes={data.readingMinutes}
          />
        </aside>

        <article className="@container flex min-w-0 flex-col gap-8">
          {seesEditorLayer(access) && (
            <EditorBar
              draft={issue.status === "draft"}
              communitySlug={community.slug}
              issueId={issue.id}
            />
          )}
          <IssueHero issue={issue} />
          <Layout items={items} href={href} />
          {items.length === 0 && <NoItems />}
        </article>

        <aside className="min-w-0 lg:col-start-2 xl:sticky xl:top-24 xl:col-start-auto xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain">
          <IssueRail
            magazine={magazine}
            community={community}
            pastIssues={pastIssues}
          />
        </aside>
      </div>
    </div>
  );
}
