import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";

const m = vi.hoisted(() => ({
  pathname: "/communities/mlops",
  rooms: [] as unknown[],
  spaces: undefined as unknown[] | undefined,
  spacesError: true,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      // The built-in fallback list: no space rows needed.
      list: {
        useQuery: () => ({ data: m.spaces, isError: m.spacesError }),
      },
      listRooms: {
        useQuery: () => ({ data: m.rooms }),
      },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => m.pathname,
}));

import { CommunityNav } from "./community-nav";

function renderNav(memberRole: "owner" | "member" | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityNav slug="mlops" memberRole={memberRole} />
    </NextIntlClientProvider>,
  );
}

const LAB = {
  id: 7,
  slug: "lab",
  name: "Lab",
  visibility: "private",
  membership: null,
};

beforeEach(() => {
  m.pathname = "/communities/mlops";
  m.rooms = [LAB];
  m.spaces = undefined;
  m.spacesError = true;
});

describe("CommunityNav", () => {
  it("is one navigation landmark for every screen size", () => {
    renderNav();
    expect(
      screen.getAllByRole("navigation", { name: "Community navigation" }),
    ).toHaveLength(1);
  });

  it("marks Overview as the current page on the community home", () => {
    renderNav();
    const nav = screen.getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Forum" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks the open tab, not Overview, on a tab's own page", () => {
    m.pathname = "/communities/mlops/forum/some-thread";
    renderNav();
    expect(screen.getByRole("link", { name: "Forum" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.getAllByRole("link").filter((l) => l.hasAttribute("aria-current")),
    ).toHaveLength(1);
  });

  it("lists rooms after the built-in tabs and says when a room is private", () => {
    renderNav();
    const lab = screen.getByRole("link", { name: /Lab/ });
    expect(lab).toHaveAttribute("href", "/communities/mlops/spaces/lab");
    expect(lab).toHaveTextContent("private room");
  });

  it("does not mark a room current on a room whose slug only starts the same", () => {
    m.rooms = [
      { ...LAB, visibility: "public" },
      { ...LAB, id: 8, slug: "lab-2", name: "Lab 2", visibility: "public" },
    ];
    m.pathname = "/communities/mlops/spaces/lab-2";
    renderNav();
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Lab 2");
  });

  it("localizes a stored default Events label", () => {
    m.spacesError = false;
    m.spaces = [
      {
        id: "events",
        kind: "builtin",
        builtinSurface: "events",
        name: "Events",
        slug: "events",
      },
    ];
    m.rooms = [];
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <CommunityNav slug="ait-demo-studio" memberRole={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("link", { name: "Événements" })).toHaveAttribute(
      "href",
      "/communities/ait-demo-studio/events",
    );
    expect(screen.queryByRole("link", { name: "Events" })).toBeNull();
  });

  it("keeps a renamed builtin tab in the name the community chose", () => {
    m.spacesError = false;
    m.spaces = [
      {
        id: "events",
        kind: "builtin",
        builtinSurface: "events",
        name: "Gatherings",
        slug: "events",
      },
    ];
    m.rooms = [];
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <CommunityNav slug="mlops" memberRole={null} />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Gatherings" }),
    ).toBeInTheDocument();
  });

  it("shows Settings to an owner only", () => {
    const { unmount } = renderNav("member");
    expect(
      screen.queryByRole("link", { name: "Settings" }),
    ).not.toBeInTheDocument();
    unmount();
    renderNav("owner");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/communities/mlops/settings",
    );
  });
});
