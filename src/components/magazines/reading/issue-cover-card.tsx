import { Link } from "@/i18n/navigation";
import { issuePath } from "@/lib/magazines/paths";
import { cn } from "@/lib/utils";
import type { IssueCard } from "@/server/magazines/reading";

import { useIssueDateline } from "./issue-dateline";

/**
 * The cover art of an issue: its cover image (alt text is the issue title),
 * or a typeset stand-in with the magazine name and issue number.
 */
export function IssueCoverArt({
  issue,
  className,
}: {
  issue: IssueCard;
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
          alt={issue.title}
          className="size-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-full flex-col justify-between p-3"
        >
          <span className="text-muted-foreground font-mono text-xs">
            {String(issue.number).padStart(2, "0")}
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
 * Magazine tab (preflight F9).
 */
export function IssueCoverCard({
  issue,
  className,
}: {
  issue: IssueCard;
  className?: string;
}) {
  const dateline = useIssueDateline(issue);
  return (
    <Link
      href={issuePath(issue.magazine, issue)}
      className={cn("group flex min-w-0 flex-col gap-2", className)}
    >
      <IssueCoverArt issue={issue} />
      <span className="text-muted-foreground font-mono text-xs">
        {dateline}
      </span>
      <span className="text-sm leading-snug font-medium text-balance underline-offset-4 group-hover:underline">
        {issue.title}
      </span>
    </Link>
  );
}
