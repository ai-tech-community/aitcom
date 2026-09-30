import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DirectoryParams } from "./discover/directory-params";

const nav = vi.hoisted(() => ({
  search: "",
  onParamsChange: null as null | ((p: Partial<DirectoryParams>) => void),
  params: null as null | DirectoryParams,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("./discover/discover-square", () => ({
  DiscoverSquare: () => <div>square</div>,
}));
vi.mock("./discover/discover-communities", () => ({
  DiscoverCommunities: (props: {
    params: DirectoryParams;
    onParamsChange: (p: Partial<DirectoryParams>) => void;
  }) => {
    nav.params = props.params;
    nav.onParamsChange = props.onParamsChange;
    return <div>communities</div>;
  },
}));
vi.mock("./discover/discover-spaces", () => ({
  DiscoverSpaces: () => <div>spaces</div>,
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
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("CommunitiesDirectory", () => {
  it("uses the same max-w-6xl page shell as Events", () => {
    const { container } = render(<CommunitiesDirectory />);
    const shell = container.firstElementChild;
    expect(shell?.className.split(/\s+/)).toContain("max-w-6xl");
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
