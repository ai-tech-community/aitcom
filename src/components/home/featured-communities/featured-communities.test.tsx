import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

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

const sceneSpy = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/components/ascii/community-house-scene", async (importOriginal) => {
  const real = await importOriginal<typeof SceneModule>();
  return {
    ...real,
    communityHouseFrame: (
      ...args: Parameters<typeof real.communityHouseFrame>
    ) => {
      sceneSpy.calls.push(args);
      return real.communityHouseFrame(...args);
    },
  };
});

import { FeaturedCommunities } from "./featured-communities";
import type * as SceneModule from "@/components/ascii/community-house-scene";
import type { FeaturedCommunityCard } from "@/server/communities/featured";

const NL_CARD: FeaturedCommunityCard = {
  id: "nl",
  slug: "ait-community-netherlands",
  name: "AIT Community Netherlands",
  description: "The Dutch AIT chapter — meetups, builders, and local hosts.",
  logoUrl: null,
  memberCount: 4,
};
const XXX_CARD: FeaturedCommunityCard = {
  id: "xxx",
  slug: "xxx-ai",
  name: "xxx.AI",
  description: "Amsterdam's AI community.",
  logoUrl: "https://cdn.example.test/xxx-ai.svg",
  memberCount: 1,
};
const HUB_CARD: FeaturedCommunityCard = {
  id: "hub",
  slug: "ait",
  name: "AIT Community",
  description:
    "The official AIT (AI Tech) community — where engineers, creators, and AI enthusiasts build the future together.",
  logoUrl: null,
  memberCount: 38,
};
const THREE = [NL_CARD, XXX_CARD, HUB_CARD];

function renderIn(
  communities: FeaturedCommunityCard[],
  locale: "en" | "nl" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <FeaturedCommunities communities={communities} />
    </NextIntlClientProvider>,
  );
}

function cardLinks() {
  return screen
    .getAllByRole("link")
    .filter((a) => a.getAttribute("href") !== "/communities");
}

describe("FeaturedCommunities", () => {
  it.each([
    [[NL_CARD], ["/communities/ait-community-netherlands"]],
    [
      [NL_CARD, HUB_CARD],
      ["/communities/ait-community-netherlands", "/communities/ait"],
    ],
    [
      THREE,
      [
        "/communities/ait-community-netherlands",
        "/communities/xxx-ai",
        "/communities/ait",
      ],
    ],
  ])("renders one linked card per featured community (%#)", (rows, hrefs) => {
    renderIn(rows);
    expect(cardLinks().map((a) => a.getAttribute("href"))).toEqual(hrefs);
    expect(screen.getAllByRole("listitem")).toHaveLength(hrefs.length);
  });

  it("omits an unlisted community and keeps the unlisted Hub", () => {
    renderIn([
      { ...NL_CARD, isListedInDirectory: true },
      { ...XXX_CARD, isListedInDirectory: false },
      { ...HUB_CARD, isListedInDirectory: false },
    ]);
    expect(cardLinks().map((a) => a.getAttribute("href"))).toEqual([
      "/communities/ait-community-netherlands",
      "/communities/ait",
    ]);
  });

  it("names each card link by the community name alone", () => {
    renderIn(THREE);
    expect(
      screen.getByRole("link", { name: "AIT Community Netherlands" }),
    ).toHaveAttribute("href", "/communities/ait-community-netherlands");
    expect(screen.getByRole("link", { name: "xxx.AI" })).toHaveAttribute(
      "href",
      "/communities/xxx-ai",
    );
    expect(screen.getByRole("link", { name: "AIT Community" })).toHaveAttribute(
      "href",
      "/communities/ait",
    );
    expect(
      screen.getByRole("link", { name: "AIT Community" }),
    ).toHaveAccessibleDescription(
      /official AIT \(AI Tech\) community.*38 members/,
    );
  });

  it("keeps the ASCII art out of the accessibility tree", () => {
    renderIn(THREE);
    for (const slug of ["ait-community-netherlands", "xxx-ai", "ait"]) {
      const art = screen.getByTestId(`community-art-${slug}`);
      expect(art).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("states the real member count in text, in English and Dutch", () => {
    const { unmount } = renderIn(THREE);
    expect(screen.getByText("4 members")).toBeInTheDocument();
    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(screen.getByText("38 members")).toBeInTheDocument();
    unmount();

    renderIn(THREE, "nl");
    expect(screen.getByText("4 leden")).toBeInTheDocument();
    expect(screen.getByText("1 lid")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Uitgelichte communities/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ontdek communities/ }),
    ).toHaveAttribute("href", "/communities");
  });

  it("spans the full page width like the other homepage sections", () => {
    const { container } = renderIn(THREE);
    const shell = container.querySelector("section")!;
    const classes = shell.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["px-6", "sm:px-12"]));
    expect(classes.some((c) => c.startsWith("max-w-"))).toBe(false);
    expect(classes).not.toContain("mx-auto");
  });

  it("uses the system card surface: full border and the resting shadow-sm", () => {
    renderIn(THREE);
    for (const card of cardLinks()) {
      const classes = card.className.split(/\s+/);
      expect(classes).toEqual(
        expect.arrayContaining(["border", "rounded-xl", "shadow-sm"]),
      );
      expect(classes.filter((c) => /(^|:)shadow-(?!sm$)/.test(c))).toEqual([]);
    }
  });

  it("renders nothing when no featured community exists", () => {
    const { container } = renderIn([{ ...NL_CARD, slug: "demo", id: "demo" }]);
    expect(container).toBeEmptyDOMElement();
  });

  it("never renders Demo, Tester, or MLOps even if they sneak into props", () => {
    renderIn([
      ...THREE,
      { ...NL_CARD, id: "demo", slug: "demo", name: "Demo" },
      { ...NL_CARD, id: "tester", slug: "tester", name: "Tester" },
      {
        ...NL_CARD,
        id: "mlops",
        slug: "mlops-amsterdam",
        name: "MLOps Amsterdam",
      },
    ]);
    expect(screen.queryByText("Demo")).toBeNull();
    expect(screen.queryByText("Tester")).toBeNull();
    expect(screen.queryByText("MLOps Amsterdam")).toBeNull();
    expect(cardLinks()).toHaveLength(3);
  });

  it("does not invent activity it cannot back up", () => {
    const { container } = renderIn(THREE);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/active discussions/i);
    expect(text).not.toMatch(/weekly active/i);
    expect(text).not.toMatch(/threads this week/i);
  });
});

describe("FeaturedCommunities art", () => {
  const box = { width: 420, height: 224 };
  const spies: { mockRestore(): void }[] = [];

  beforeEach(() => {
    sceneSpy.calls = [];
    spies.push(
      vi
        .spyOn(HTMLElement.prototype, "clientWidth", "get")
        .mockImplementation(() => box.width),
      vi
        .spyOn(HTMLElement.prototype, "clientHeight", "get")
        .mockImplementation(() => box.height),
    );
  });
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it("draws each card's own house from its slug and real member count", () => {
    renderIn(THREE);
    const drawn = sceneSpy.calls.map(([slug, members]) => [slug, members]);
    expect(drawn).toEqual(
      expect.arrayContaining([
        ["ait-community-netherlands", 4],
        ["xxx-ai", 1],
        ["ait", 38],
      ]),
    );
    const art = screen.getByTestId("community-art-ait");
    const people = within(art)
      .getAllByText((_, el) => el?.tagName === "PRE")
      .map((pre) => pre.textContent ?? "")
      .join("\n");
    expect(people).toContain("[•]");
    expect(people).toContain("___");
  });
});
