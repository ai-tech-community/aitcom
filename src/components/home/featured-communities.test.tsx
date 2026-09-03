import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { FeaturedCommunities } from "./featured-communities";
import type { FeaturedCommunityCard } from "@/server/communities/featured";

const THREE: FeaturedCommunityCard[] = [
  {
    id: "nl",
    slug: "ait-community-netherlands",
    name: "AIT Community Netherlands",
    description: "The Dutch AIT chapter — meetups, builders, and local hosts.",
    logoUrl: null,
    memberCount: 42,
  },
  {
    id: "xxx",
    slug: "xxx-ai",
    name: "xxx.AI",
    description: "Amsterdam's AI community.",
    logoUrl: "https://cdn.example.test/xxx-ai.svg",
    memberCount: 18,
  },
  {
    id: "hub",
    slug: "ait",
    name: "AIT Community",
    description:
      "The official AIT (AI Tech) community — where engineers, creators, and AI enthusiasts build the future together.",
    logoUrl: null,
    memberCount: 200,
  },
];

describe("FeaturedCommunities", () => {
  it("links the three featured slugs into Explore community pages", () => {
    render(<FeaturedCommunities communities={THREE} />);

    expect(
      screen.getByRole("link", { name: /AIT Community Netherlands/ }),
    ).toHaveAttribute("href", "/communities/ait-community-netherlands");
    expect(screen.getByRole("link", { name: /xxx\.AI/ })).toHaveAttribute(
      "href",
      "/communities/xxx-ai",
    );
    expect(
      screen.getByRole("link", { name: /official AIT \(AI Tech\) community/ }),
    ).toHaveAttribute("href", "/communities/ait");
  });

  it("uses the same max-w-6xl page shell as Events / Discover", () => {
    const { container } = render(<FeaturedCommunities communities={THREE} />);
    const shell = container.firstElementChild;
    expect(shell?.className.split(/\s+/)).toContain("max-w-6xl");
    expect(shell?.className.split(/\s+/)).not.toContain("max-w-5xl");
  });

  it("shows member counts and purpose, not invented activity", () => {
    const { container } = render(<FeaturedCommunities communities={THREE} />);

    expect(screen.getByText(/membersCount:\{"count":42\}/)).toBeInTheDocument();
    expect(screen.getByText(/membersCount:\{"count":18\}/)).toBeInTheDocument();
    expect(
      screen.getByText(/membersCount:\{"count":200\}/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /The Dutch AIT chapter — meetups, builders, and local hosts./,
      ),
    ).toBeInTheDocument();

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/active discussions/i);
    expect(text).not.toMatch(/weekly active/i);
    expect(text).not.toMatch(/threads this week/i);
  });

  it("never renders Demo, Tester, or MLOps even if they sneak into props", () => {
    render(
      <FeaturedCommunities
        communities={[
          ...THREE,
          {
            id: "demo",
            slug: "demo",
            name: "Demo",
            description: "Fake community",
            logoUrl: null,
            memberCount: 1,
          },
          {
            id: "tester",
            slug: "tester",
            name: "Tester",
            description: null,
            logoUrl: null,
            memberCount: 1,
          },
          {
            id: "mlops",
            slug: "mlops-amsterdam",
            name: "MLOps Amsterdam",
            description: null,
            logoUrl: null,
            memberCount: 1,
          },
        ]}
      />,
    );

    expect(screen.queryByRole("link", { name: /^Demo$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Tester/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /MLOps Amsterdam/ })).toBeNull();
    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        "/communities/ait-community-netherlands",
        "/communities/xxx-ai",
        "/communities/ait",
      ]),
    );
  });
});
