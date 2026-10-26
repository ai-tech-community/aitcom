import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

const m = vi.hoisted(() => ({ pathname: "/communities/mlops" }));

vi.mock("@/trpc/react", () => ({
  api: {
    spaces: {
      // The built-in fallback list: no space rows needed.
      list: { useQuery: () => ({ data: undefined, isError: true }) },
      listRooms: {
        useQuery: () => ({
          data: [
            {
              id: 7,
              slug: "lab",
              name: "Lab",
              visibility: "private",
              membership: null,
            },
          ],
        }),
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

beforeEach(() => {
  m.pathname = "/communities/mlops";
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

  it("shows Settings to an owner only", () => {
    renderNav("member");
    expect(
      screen.queryByRole("link", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });
});
