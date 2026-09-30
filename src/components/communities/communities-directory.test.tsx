import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DirectoryParams } from "./discover/directory-params";

const nav = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  onParamsChange: null as null | ((p: Partial<DirectoryParams>) => void),
  params: null as null | DirectoryParams,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/communities",
  useRouter: () => ({ replace: nav.replace }),
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
  CreateCommunityButton: () => <button type="button">create</button>,
}));

import { CommunitiesDirectory } from "./communities-directory";

afterEach(() => {
  nav.search = "";
  nav.replace.mockReset();
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

  it("writes filter changes to the URL without scrolling", () => {
    nav.search = "q=ml";
    render(<CommunitiesDirectory />);
    nav.onParamsChange!({ place: "online" });
    expect(nav.replace).toHaveBeenCalledWith(
      "/communities?q=ml&place=online",
      { scroll: false },
    );
    nav.onParamsChange!({ q: "", place: null });
    expect(nav.replace).toHaveBeenLastCalledWith("/communities", {
      scroll: false,
    });
  });
});
