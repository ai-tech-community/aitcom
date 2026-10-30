import { IssueItem } from "../items/registry";
import { itemAnchorId } from "../reading/anchors";
import type { LayoutProps } from "./types";

/** Every item leads, in one reading column and in issue order. */
export function LongReadLayout({ items, href, teaser }: LayoutProps) {
  return (
    <div className="@container mx-auto flex w-full max-w-3xl flex-col gap-6">
      {items.map((view) => (
        <div
          key={view.itemId}
          id={itemAnchorId(view.itemId)}
          className="min-w-0 scroll-mt-24"
        >
          <IssueItem view={view} size="lead" href={href} teaser={teaser} />
        </div>
      ))}
    </div>
  );
}
