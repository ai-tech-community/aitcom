// A magazine's shelf: who makes it, then every issue the viewer may read.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./subscribe-button", () => ({
  SubscribeButton: ({
    magazineSlug,
    magazineName,
  }: {
    magazineSlug: string;
    magazineName: string;
  }) => (
    <div data-testid="subscribe" data-slug={magazineSlug}>
      {magazineName}
    </div>
  ),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { issueCard, shelfData } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { MagazineShelf } from "./magazine-shelf";

function issueList() {
  return within(screen.getByRole("region", { name: /Issues/ })).getAllByRole(
    "listitem",
  );
}

describe("MagazineShelf", () => {
  it("labels a preview issue 'Members read in full'", () => {
    renderWithIntl(
      <MagazineShelf
        data={shelfData({
          issues: [
            issueCard({
              visibility: "public",
              effectiveVisibility: "teaser",
              outsiderReach: "teaser",
            }),
          ],
        })}
      />,
    );
    expect(
      within(issueList()[0]!).getByText("Members read in full"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Members only")).toBeNull();
  });

  it("offers to subscribe beside the topics", () => {
    renderWithIntl(
      <MagazineShelf data={shelfData({ viewerIsEditor: true })} />,
    );
    const subscribe = screen.getByTestId("subscribe");
    expect(subscribe).toHaveAttribute("data-slug", "agents-weekly");
    expect(subscribe).toHaveTextContent("Agents Weekly");
    const actions = subscribe.parentElement!;
    expect(
      within(actions).getByRole("list", { name: "Topics" }),
    ).toBeInTheDocument();
    const manage = within(actions).getByRole("link", {
      name: "Manage magazine",
    });
    expect(
      subscribe.compareDocumentPosition(manage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the magazine, its community and its topics", () => {
    renderWithIntl(<MagazineShelf data={shelfData()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Agents Weekly" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Amsterdam AI Builders" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai");
    expect(
      screen.getByText("A monthly magazine about agents that work."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "agents" })).toHaveAttribute(
      "href",
      "/magazines?topic=agents",
    );
  });

  it("marks members-only issues for members", () => {
    renderWithIntl(<MagazineShelf data={shelfData()} />);
    const [membersOnly, open] = issueList();
    expect(within(membersOnly!).getByText("Members only")).toBeInTheDocument();
    expect(within(open!).queryByText("Members only")).toBeNull();
  });

  it("keys the badge off the effective visibility, not the stored one", () => {
    // An unconfirmed public issue in an unlisted community (preflight F10).
    renderWithIntl(
      <MagazineShelf
        data={shelfData({
          issues: [
            issueCard({ visibility: "public", effectiveVisibility: "members" }),
          ],
        })}
      />,
    );
    expect(
      within(issueList()[0]!).getByText("Members only"),
    ).toBeInTheDocument();
  });

  it("links every cover to its issue path", () => {
    renderWithIntl(<MagazineShelf data={shelfData()} />);
    const hrefs = issueList().map((item) =>
      within(item).getByRole("link").getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/magazines/agents-weekly/issue-5",
      "/magazines/agents-weekly/issue-4",
    ]);
  });

  it("teaches readers and editors what comes next on an empty shelf", () => {
    const { unmount } = renderWithIntl(
      <MagazineShelf data={shelfData({ issues: [] })} />,
    );
    expect(screen.getByText("No issues yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visit Amsterdam AI Builders" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai");
    expect(screen.queryByRole("link", { name: "Manage magazine" })).toBeNull();
    unmount();

    renderWithIntl(
      <MagazineShelf data={shelfData({ issues: [], viewerIsEditor: true })} />,
    );
    expect(
      screen.getByText(/Make the first issue from your community/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Manage magazine" })[0],
    ).toHaveAttribute("href", "/communities/amsterdam-ai/magazine");
  });
});
