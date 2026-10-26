import { useTranslations } from "next-intl";

import type { IssueCard } from "@/server/magazines/reading";

import { IssueCoverArt } from "./issue-cover-card";
import { useIssueDateline } from "./issue-dateline";

/**
 * The masthead of the issue reading page: magazine name, issue number and
 * month, the issue title (the page's one `h1`) and the cover.
 */
export function IssueCover({ issue }: { issue: IssueCard }) {
  const t = useTranslations("magazines.issue");
  const dateline = useIssueDateline(issue);
  return (
    <header className="@container">
      <div className="flex flex-col-reverse gap-6 @xl:flex-row @xl:items-end @xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-lg font-semibold tracking-tight">
            {issue.magazine.name}
          </p>
          <p className="text-muted-foreground font-mono text-xs">{dateline}</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance break-words @xl:text-4xl">
            {issue.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("byCommunity", { community: issue.community.name })}
          </p>
        </div>
        {issue.coverImageUrl && (
          <IssueCoverArt issue={issue} className="w-40 shrink-0 @xl:w-48" />
        )}
      </div>
    </header>
  );
}
