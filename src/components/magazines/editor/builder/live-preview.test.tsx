import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorItemView } from "@/lib/magazines/item-views";

import {
  eventView,
  forumThreadView,
  launchpadProjectView,
  newsItemView,
  storylineView,
} from "../../test-fixtures";
import { renderWithIntl } from "../../test-intl";

vi.mock("@/trpc/react", () => ({ api: {} }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LivePreview, visibleToVisitors } from "./live-preview";
import type { BuilderItem } from "./items-model";

describe("LivePreview", () => {
  it("visitor preview leaves out members-only items and markers", () => {
    const views: EditorItemView[] = [
      storylineView(),
      newsItemView(),
      eventView(),
      { ...eventView(2), membersOnly: true },
      { ...forumThreadView(), membersOnly: true },
      { ...launchpadProjectView(), membersOnly: true },
      {
        kind: "storyline",
        itemId: "gone",
        unavailable: true,
        reason: "unpublished",
      },
    ];
    const items: BuilderItem[] = [
      { kind: "storyline", storylineId: "s1", key: views[0]!.itemId },
      { kind: "newsItem", newsItemId: "n1", key: views[1]!.itemId },
      { kind: "event", eventId: 1, key: views[2]!.itemId },
      { kind: "event", eventId: 2, key: views[3]!.itemId },
      { kind: "forumThread", threadId: 1, key: views[4]!.itemId },
      { kind: "launchpadProject", projectId: 1, key: views[5]!.itemId },
      { kind: "storyline", storylineId: "s2", key: "gone" },
    ];
    renderWithIntl(
      <LivePreview
        magazine={{ name: "Gazette", slug: "gazette" }}
        community={{ name: "Night Owls" }}
        issue={{ number: 1, publishedAt: null }}
        details={{
          title: "Community picks",
          slug: "picks",
          coverImageUrl: null,
          editorNote: null,
          visibility: "public",
        }}
        layout="cover-story"
        items={items}
        savedViews={new Map(views.map((view) => [view.itemId, view]))}
        audience="public"
      />,
    );
    const preview = screen.getByTestId("issue-preview");
    expect(preview).toHaveTextContent("Event 2");
    expect(preview).toHaveTextContent("No longer available");
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    for (const title of ["Story 1", "Headline 1", "Event 1"])
      expect(within(preview).getByText(title)).toBeInTheDocument();
    for (const title of [
      "Event 2",
      "Thread 1",
      "Project 1",
      "No longer available",
    ])
      expect(within(preview).queryByText(title)).toBeNull();
    expect(views.map(visibleToVisitors)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    for (const name of ["Phone", "Member"]) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(preview).toHaveTextContent("Event 2");
      expect(preview).toHaveTextContent("No longer available");
    }
  });
});
