import { IssueItem } from "../items/registry";
import { itemAnchorId } from "../reading/anchors";
import type { LayoutProps } from "./types";

/** A short list; each kind owns its compact row. */
export function DigestLayout({ items, href, teaser }: LayoutProps) {
  return (
    <ol className="divide-border divide-y">
      {items.map((view) => (
        <li
          key={view.itemId}
          id={itemAnchorId(view.itemId)}
          className="min-w-0 scroll-mt-24"
        >
          <IssueItem view={view} size="row" href={href} teaser={teaser} />
        </li>
      ))}
    </ol>
  );
}
