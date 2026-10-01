import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DirectoryParams } from "./discover/directory-params";

const nav = vi.hoisted(() => ({
  search: "",
  onParamsChange: null as null | ((p: Partial<DirectoryParams>) => void),
  params: null as null | DirectoryParams,
  rooms: { talking: [] as unknown[], quiet: [{ spaceId: "q" }] as unknown[] },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("./discover/square-hero", () => ({
  SquareHero: ({ headline }: { headline: React.ReactNode }) => (
    <section>{headline}</section>
  ),
}));

vi.mock("./discover/square-rooms", () => ({
  useSquareRooms: () => ({ data: nav.rooms }),
  RoomsPanel: () => <div data-testid="rooms-panel" />,
  RoomsStrip: ({ part }: { part: string }) => (
    <div data-testid={`rooms-strip-${part}`} />
  ),
}));
vi.mock("./discover/discover-communities", async () => ({
  ALL_COMMUNITIES_ID: "all-communities-title",
  DiscoverCommunities: (props: {
    params: DirectoryParams;
    onParamsChange: (p: Partial<DirectoryParams>) => void;
  }) => {
    nav.params = props.params;
    nav.onParamsChange = props.onParamsChange;
    return <div>communities</div>;
  },
}));
vi.mock("./discover/organizer-invite", () => ({
  OrganizerInvite: () => <div>invite</div>,
}));
vi.mock("./create-community-dialog", () => ({
  CreateCommunityProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CreateCommunityButton: ({
    variant,
    children,
  }: {
    variant?: string;
    children?: React.ReactNode;
  }) => (
    <button type="button" data-variant={variant ?? "default"}>
      {children}
    </button>
  ),
}));

import { CommunitiesDirectory } from "./communities-directory";

afterEach(() => {
  nav.search = "";
  nav.rooms = { talking: [], quiet: [{ spaceId: "q" }] };
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("CommunitiesDirectory", () => {
  it("frames the directory wider than other pages, by design", () => {
    render(<CommunitiesDirectory />);
    const frame = screen
      .getByTestId("rooms-panel")
      .closest("[class*='max-w-[1600px]']");
    expect(frame).not.toBeNull();
  });

  it("shows the rooms as a side panel and as strips for narrow screens", () => {
    render(<CommunitiesDirectory />);
    expect(screen.getByTestId("rooms-panel")).toBeInTheDocument();
    expect(screen.getByTestId("rooms-strip-talking")).toBeInTheDocument();
    expect(screen.getByTestId("rooms-strip-open")).toBeInTheDocument();
  });

  it("puts the panel before the card list for keyboard order", () => {
    render(<CommunitiesDirectory />);
    const panel = screen.getByTestId("rooms-panel");
    const list = screen.getByText("communities");
    expect(
      panel.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("gives the panel no column when there are no rooms", () => {
    nav.rooms = { talking: [], quiet: [] };
    render(<CommunitiesDirectory />);
    expect(screen.queryByTestId("rooms-panel")).toBeNull();
    expect(document.querySelector("[class*='xl:grid-cols-']")).toBeNull();
  });

  it("offers browsing next to starting a community", () => {
    render(<CommunitiesDirectory />);
    expect(screen.getByRole("link", { name: "browseAction" })).toHaveAttribute(
      "href",
      "#all-communities-title",
    );
  });

  it("leads with a human headline as the page heading", () => {
    render(<CommunitiesDirectory />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "headline",
    );
  });

  it("reads the filters from the URL", () => {
    nav.search = "q=ml&place=Utrecht&sort=newest";
    render(<CommunitiesDirectory />);
    expect(nav.params).toEqual({ q: "ml", place: "Utrecht", sort: "newest" });
  });

  it("writes filter changes into the URL in place", () => {
    window.history.replaceState(null, "", "/en/communities?q=ml");
    nav.search = "q=ml";
    const replace = vi.spyOn(window.history, "replaceState");
    render(<CommunitiesDirectory />);
    nav.onParamsChange!({ place: "online" });
    expect(replace).toHaveBeenLastCalledWith(
      null,
      "",
      "/en/communities?q=ml&place=online",
    );
    nav.onParamsChange!({ q: "", place: null });
    expect(replace).toHaveBeenLastCalledWith(null, "", "/en/communities");
  });

  it("offers organizers a quiet way to start, not an orange primary", () => {
    render(<CommunitiesDirectory />);
    expect(
      screen.getByRole("button", { name: "inviteAction" }),
    ).toHaveAttribute("data-variant", "outline");
  });
});
