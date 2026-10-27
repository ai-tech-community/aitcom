import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { issuePath } from "@/lib/magazines/paths";
import type { IssueCard } from "@/server/magazines/reading";

import { IssueCoverArt } from "./issue-cover-card";
import { useIssueDateline } from "./issue-dateline";

/**
 * How the lead action is ranked (One Voice Rule). `primary` where "Read the
 * issue" is the page's single most important action (the `/magazines`
 * home); `ink` where the page around it already owns the orange action —
 * a community's pages, whose frame carries Join.
 */
export type FeaturedIssueEmphasis = "primary" | "ink";

/**
 * A page's lead issue: its cover beside its magazine, dateline, title,
 * community and the lead action, "Read the issue". The `/magazines` home
 * leads with it ("Featured issue", the page's one orange action), and so
 * does the community Magazine tab ("Latest issue", without the community,
 * whose page it is, and in ink: the community frame's Join is that page's
 * orange). The card's sections stack in a narrow column and sit side by
 * side from the container's `xl` width.
 */
export function FeaturedIssue({
  issue,
  labelId,
  label,
  showCommunity = true,
  emphasis = "primary",
}: {
  issue: IssueCard;
  /** The id of the label that names the section. */
  labelId: string;
  /** The section label; "Featured issue" when not given. */
  label?: string;
  /** Name the issue's community ("From …"); off on the community's own tab. */
  showCommunity?: boolean;
  /** The lead action's rank; see `FeaturedIssueEmphasis`. */
  emphasis?: FeaturedIssueEmphasis;
}) {
  const t = useTranslations("magazines");
  const dateline = useIssueDateline(issue);
  return (
    <div className="bg-card text-card-foreground @container rounded-xl border">
      <div className="grid gap-6 p-5 @xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @xl:p-6">
        {/* The button below is the one way in for keyboards and screen readers. */}
        <Link
          href={issuePath(issue.magazine, issue)}
          tabIndex={-1}
          aria-hidden="true"
          className="block w-full max-w-60 @xl:max-w-none"
        >
          <IssueCoverArt issue={issue} />
        </Link>
        <div className="flex min-w-0 flex-col gap-4">
          <SectionLabel as="p" id={labelId}>
            {label ?? t("home.featured")}
          </SectionLabel>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{issue.magazine.name}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {dateline}
            </p>
            <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance break-words @xl:text-3xl">
              {issue.title}
            </h2>
            {showCommunity && (
              <p className="text-muted-foreground text-sm">
                {t("home.fromCommunity", { community: issue.community.name })}
              </p>
            )}
          </div>
          <Button
            asChild
            variant={emphasis === "ink" ? "ink" : "default"}
            className="self-start"
          >
            <Link href={issuePath(issue.magazine, issue)}>
              {t("home.readIssue")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
