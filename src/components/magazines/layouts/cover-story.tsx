import { IssueItem } from "../items/registry";
import { itemAnchorId } from "../reading/anchors";

import type { LayoutProps } from "./types";

/**
 * The cover-story layout: the first item as the lead
 * (full width, larger heading, its opening and "Read article"), then the
 * rest in a grid that splits on its own width, in issue order.
 */
export function CoverStoryLayout({ items, href, teaser }: LayoutProps) {
  const [lead, ...rest] = items;
  return (
    <div className="@container flex flex-col gap-6">
      {lead && (
        <div
          id={itemAnchorId(lead.itemId)}
          data-testid="issue-lead"
          className="scroll-mt-24"
        >
          <IssueItem view={lead} lead href={href} teaser={teaser} />
        </div>
      )}
      {rest.length > 0 && (
        <div
          data-testid="issue-grid"
          className="grid gap-6 @xl:grid-cols-2 @5xl:grid-cols-3"
        >
          {rest.map((view) => (
            <div
              key={view.itemId}
              id={itemAnchorId(view.itemId)}
              className="min-w-0 scroll-mt-24"
            >
              <IssueItem view={view} lead={false} href={href} teaser={teaser} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
