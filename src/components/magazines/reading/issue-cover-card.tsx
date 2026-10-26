import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { issuePath } from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";
import type { IssueCard } from "@/server/magazines/reading";

import { issueNumberText, useIssueDateline } from "./issue-dateline";

/** What a cover is drawn from. */
export type CoverArtIssue = Pick<IssueCard, "number" | "coverImageUrl"> & {
  title: string;
  magazine: { name: string };
};

/**
 * How large a cover is drawn. `thumb` is a small row thumbnail (the stand-in
 * shows the issue number only); `card` a shelf or grid cover; `hero` the
 * issue page's large cover, whose stand-in is typeset like a printed cover:
 * issue number, masthead and the issue title as its lead.
 */
export type CoverArtSize = "thumb" | "card" | "hero";

/**
 * The cover art of an issue: its cover image, or a typeset stand-in with the
 * magazine name and issue number.
 *
 * The image is decorative (`alt=""`): every cover sits beside or inside text
 * that already names the issue or the magazine (a card's title, the page
 * heading, a tile's magazine name), so alt text would only make screen
 * readers say that name twice.
 */
export function IssueCoverArt({
  issue,
  size = "card",
  className,
}: {
  issue: CoverArtIssue;
  size?: CoverArtSize;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-secondary relative aspect-[3/4] w-full overflow-hidden rounded-lg border",
        className,
      )}
    >
      {issue.coverImageUrl ? (
        // Any host an editor links to: next/image only serves listed hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={issue.coverImageUrl}
          alt=""
          className="size-full object-cover"
        />
      ) : size === "thumb" ? (
        <div
          aria-hidden="true"
          className="text-muted-foreground flex size-full items-center justify-center font-mono text-xs"
        >
          {issueNumberText(issue.number)}
        </div>
      ) : size === "hero" ? (
        <div
          aria-hidden="true"
          className="flex size-full flex-col justify-between gap-6 p-6 @3xl:p-8"
        >
          <span className="text-muted-foreground font-mono text-xs">
            {issueNumberText(issue.number)}
          </span>
          <span className="flex flex-col gap-3">
            <span className="text-3xl leading-none font-bold tracking-tight break-words @3xl:text-4xl">
              {issue.magazine.name}
            </span>
            <span className="line-clamp-4 text-lg leading-snug font-semibold text-balance break-words">
              {issue.title}
            </span>
          </span>
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex size-full flex-col justify-between p-3"
        >
          <span className="text-muted-foreground font-mono text-xs">
            {issueNumberText(issue.number)}
          </span>
          <span className="line-clamp-3 text-sm leading-tight font-semibold tracking-tight break-words">
            {issue.magazine.name}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * One issue as a cover card that links to its reading page: the cover,
 * "Issue 04 · November 2026" and the title. Shared by the issue page's
 * past issues, the `/magazines` home, a magazine's shelf and the community
 * Magazine tab (preflight F9). `stacked` puts the cover above the text
 * (shelves and grids); `row` puts a small cover beside it (narrow rails).
 */
export function IssueCoverCard({
  issue,
  variant = "stacked",
  showMagazine = false,
  badge,
  className,
}: {
  issue: IssueCard;
  variant?: "stacked" | "row";
  /** Name the magazine too: for lists that mix magazines (the home). */
  showMagazine?: boolean;
  /** A quiet label beside the dateline, e.g. "Members only" on a shelf. */
  badge?: ReactNode;
  className?: string;
}) {
  const dateline = useIssueDateline(issue);
  const row = variant === "row";
  return (
    <Link
      href={issuePath(issue.magazine, issue)}
      className={cn(
        "group flex min-w-0 gap-2",
        row ? "flex-row items-start gap-3" : "flex-col",
        className,
      )}
    >
      <IssueCoverArt
        issue={issue}
        size={row ? "thumb" : "card"}
        className={cn(row && "w-14 shrink-0")}
      />
      <span className="flex min-w-0 flex-col gap-1">
        {showMagazine && (
          <span className="text-sm leading-tight font-semibold break-words">
            {issue.magazine.name}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {dateline}
          </span>
          {badge}
        </span>
        <span className="text-sm leading-snug font-medium text-balance break-words underline-offset-4 group-hover:underline">
          {issue.title}
        </span>
      </span>
    </Link>
  );
}
