import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NextIntlClientProvider } from "next-intl";
import en from "../../../../../messages/en.json";
import type { IssueLayout } from "@/lib/magazines/values";

import type { EditorItemView } from "@/lib/magazines/item-views";

import {
  articleView,
  editorialView,
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
  it("the layout choice changes the preview", () => {
    const article = articleView(1);
    const props = {
      magazine: { name: "Gazette", slug: "gazette" },
      community: { name: "Night Owls", slug: "night-owls" },
      issue: { number: 1, publishedAt: null },
      details: {
        title: "Picks",
        slug: "picks",
        coverImageUrl: null,
        editorNote: null,
        visibility: "teaser" as const,
        layout: "cover-story" as const,
      },
      items: [{ kind: "article" as const, articleId: 1, key: article.itemId }],
      savedViews: new Map([[article.itemId, article]]),
      audience: "teaser" as const,
    };
    const picture = (layout: IssueLayout) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LivePreview {...props} details={{ ...props.details, layout }} />
      </NextIntlClientProvider>
    );
    const { rerender } = renderWithIntl(picture("cover-story"));
    expect(screen.getByTestId("issue-lead")).toHaveTextContent(
      "Excerpt of article 1.",
    );
    rerender(picture("digest"));
    const preview = screen.getByTestId("issue-preview");
    expect(within(preview).getByRole("list", { hidden: true }).tagName).toBe(
      "OL",
    );
    expect(preview).not.toHaveTextContent("Excerpt of article 1.");
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    expect(preview).toHaveTextContent("Members read the whole article");
    expect(within(preview).getAllByText("Join Night Owls")).toHaveLength(1);
    rerender(picture("long-read"));
    expect(preview).toHaveTextContent("Opening of article 1.");
    expect(within(preview).getAllByText("Join Night Owls")).toHaveLength(2);
  });
  it("Visitor shows a preview issue with openings and a join picture", () => {
    const article = articleView(1);
    const editorial = editorialView(1, { intro: "Editorial intro." });
    renderWithIntl(
      <LivePreview
        magazine={{ name: "Gazette", slug: "gazette" }}
        community={{ name: "Night Owls", slug: "night-owls" }}
        issue={{ number: 1, publishedAt: null }}
        details={{
          title: "Community picks",
          slug: "picks",
          coverImageUrl: null,
          editorNote: null,
          layout: "cover-story",
          visibility: "teaser",
        }}
        items={[
          { kind: "article", articleId: 1, key: article.itemId },
          {
            kind: "editorial",
            heading: editorial.heading ?? undefined,
            intro: editorial.intro ?? undefined,
            body: editorial.body,
            key: editorial.itemId,
          },
        ]}
        savedViews={
          new Map<string, EditorItemView>([
            [article.itemId, article],
            [editorial.itemId, editorial],
          ])
        }
        audience="teaser"
      />,
    );
    const preview = screen.getByTestId("issue-preview");
    expect(preview).toHaveTextContent("Body of editorial 1.");
    expect(preview).toHaveTextContent("Excerpt of article 1.");
    fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
    expect(preview).toHaveTextContent("Opening of article 1.");
    expect(preview).toHaveTextContent("Editorial 1");
    expect(preview).toHaveTextContent("Editorial intro.");
    expect(preview).not.toHaveTextContent("Body of editorial 1.");
    expect(preview).not.toHaveTextContent("Excerpt of article 1.");
    const prompts = within(preview).getAllByText("Join Night Owls");
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts)
      expect(prompt.closest("[inert]")).not.toBeNull();
    expect(
      within(preview).getByText("Read the whole issue").closest("[inert]"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Member" }));
    expect(preview).toHaveTextContent("Body of editorial 1.");
    expect(within(preview).queryByText("Join Night Owls")).toBeNull();
  });

  it.each([false, true])(
    "explains when no loaded items are visible to visitors, including while another item waits for save (%s)",
    (waiting) => {
      const hidden = { ...eventView(), membersOnly: true };
      renderWithIntl(
        <LivePreview
          magazine={{ name: "Gazette", slug: "gazette" }}
          community={{ name: "Night Owls", slug: "night-owls" }}
          issue={{ number: 1, publishedAt: null }}
          details={{
            title: "Community picks",
            slug: "picks",
            coverImageUrl: null,
            editorNote: null,
            layout: "cover-story",
            visibility: "public",
          }}
          items={[
            { kind: "event", eventId: 1, key: hidden.itemId },
            ...(waiting
              ? [{ kind: "article" as const, articleId: 9, key: "waiting" }]
              : []),
          ]}
          savedViews={new Map([[hidden.itemId, hidden]])}
          audience="public"
        />,
      );
      fireEvent.click(screen.getByRole("radio", { name: "Visitor" }));
      expect(screen.getByTestId("issue-preview")).toHaveTextContent(
        "Visitors cannot see any item in this issue yet. Members-only and missing items are hidden.",
      );
      expect(
        screen.queryByText("Add something to see the issue here."),
      ).toBeNull();
    },
  );

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
        community={{ name: "Night Owls", slug: "night-owls" }}
        issue={{ number: 1, publishedAt: null }}
        details={{
          title: "Community picks",
          slug: "picks",
          coverImageUrl: null,
          editorNote: null,
          layout: "cover-story",
          visibility: "public",
        }}
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
