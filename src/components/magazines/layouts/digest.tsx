import { IssueItem } from "../items/registry";
import { itemAnchorId } from "../reading/anchors";
import type { LayoutProps } from "./types";

/** A short numbered list; each kind owns its compact row. */
export function DigestLayout({ items, href, teaser }: LayoutProps) {
  return (
    <ol className="divide-border divide-y">
      {items.map((view, index) => (
        <li
          key={view.itemId}
          id={itemAnchorId(view.itemId)}
          className="grid min-w-0 scroll-mt-24 grid-cols-[2.5rem_minmax(0,1fr)] items-baseline"
        >
          {/* The list itself tells assistive tech the position. */}
          <span
            aria-hidden="true"
            className="text-muted-foreground font-mono text-sm tabular-nums"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <IssueItem view={view} size="row" href={href} teaser={teaser} />
        </li>
      ))}
    </ol>
  );
}
