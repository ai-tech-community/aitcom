import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AI_TOOLS_LIST_COPY } from "@/lib/investigations/ai-tools-list";
import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

type HubCard = {
  name: string;
  slug: string;
  logoUrl: string | null;
  category: "agents" | "models";
  description: string | null;
  openRoleCount: number;
};

const state = vi.hoisted(() => ({
  cards: [] as HubCard[],
}));

vi.mock("server-only", () => ({}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
}));

vi.mock("@/server/startups/queries", () => ({
  listAiToolsHubStartups: async () => state.cards,
}));

import AiToolsListPage from "@/app/[locale]/startups/ai-tools-list/page";

import { AiToolsListHub } from "./ai-tools-list-hub";

function card(
  partial: Partial<HubCard> & Pick<HubCard, "name" | "slug">,
): HubCard {
  return {
    logoUrl: null,
    category: "agents",
    description: "a".repeat(80),
    openRoleCount: 0,
    ...partial,
  };
}

function listedItems(container: HTMLElement) {
  return JSON.parse(
    container.querySelector("script[type='application/ld+json']")
      ?.textContent ?? "{}",
  ) as {
    "@type": string;
    url: string;
    mainEntity: {
      "@type": string;
      itemListElement: Array<Record<string, unknown>>;
    };
  };
}

describe("AI tools hub page", () => {
  it("shows its own intro and an empty CollectionPage when nothing qualifies", async () => {
    state.cards = [];
    const page = render(
      await AiToolsListPage({ searchParams: Promise.resolve({}) }),
    );
    const intro = page.container.querySelector("p.text-muted-foreground");
    expect(intro?.textContent).toBe(AI_TOOLS_LIST_COPY.en.intro);
    expect(intro?.textContent).not.toBe(AI_TOOLS_LIST_COPY.en.description);
    expect(page.container.textContent).not.toContain("AI TOOLS LIST");
    expect(page.container.textContent).not.toContain("limitless");
    expect(page.container.textContent).not.toContain("aiai.tools");
    expect(page.container.querySelector("ul")).toBeNull();

    const data = listedItems(page.container);
    expect(data["@type"]).toBe("CollectionPage");
    expect(data.mainEntity["@type"]).toBe("ItemList");
    expect(data.mainEntity.itemListElement).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("Organization");
    page.unmount();

    const dutch = render(
      <AiToolsListHub locale="nl" cards={[]} page={1} totalPages={1} />,
    );
    expect(
      dutch.container.querySelector("p.text-muted-foreground")?.textContent,
    ).toBe(AI_TOOLS_LIST_COPY.nl.intro);
    dutch.unmount();
  });

  it("links each rendered startup to its profile and matches the ItemList", async () => {
    state.cards = [
      card({
        name: "Writer",
        slug: "writer",
        logoUrl: "https://cdn.example/logo.png",
        category: "agents",
      }),
      card({
        name: "Model Co",
        slug: "model-co",
        logoUrl: null,
        category: "models",
      }),
    ];
    const page = render(
      await AiToolsListPage({ searchParams: Promise.resolve({}) }),
    );
    const links = [...page.container.querySelectorAll("ul a")].map(
      (anchor) => ({
        name: anchor.textContent,
        url: anchor.getAttribute("href"),
      }),
    );
    expect(links).toEqual([
      { name: "Writer", url: "/en/startups/writer" },
      { name: "Model Co", url: "/en/startups/model-co" },
    ]);
    expect(
      page.container
        .querySelector("[data-startup-logo]")
        ?.getAttribute("data-startup-logo"),
    ).toBe("https://cdn.example/logo.png");
    expect(
      page.container.querySelector("[data-startup-monogram]"),
    ).not.toBeNull();
    expect(page.container.textContent).toContain("Agents");
    expect(page.container.textContent).toContain("Models");

    const data = listedItems(page.container);
    expect(data.url).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/en/startups/ai-tools-list`,
    );
    expect(data.mainEntity.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Writer",
        url: `${CANONICAL_PRODUCTION_ORIGIN}/en/startups/writer`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Model Co",
        url: `${CANONICAL_PRODUCTION_ORIGIN}/en/startups/model-co`,
      },
    ]);
  });

  it("pages the directory at 24 and lists only the current page", async () => {
    state.cards = Array.from({ length: 25 }, (_, index) =>
      card({
        name: `Startup ${String(index + 1).padStart(2, "0")}`,
        slug: `startup-${index + 1}`,
      }),
    );
    const first = render(
      await AiToolsListPage({ searchParams: Promise.resolve({}) }),
    );
    expect(first.container.querySelectorAll("ul a")).toHaveLength(24);
    expect(
      first.container.querySelector("a[href$='?page=2']")?.textContent,
    ).toContain("Next");
    expect(first.container.textContent).toContain("1 / 2");
    const firstData = listedItems(first.container);
    expect(firstData.mainEntity.itemListElement).toHaveLength(24);
    expect(firstData.mainEntity.itemListElement[0]).toMatchObject({
      position: 1,
      name: "Startup 01",
    });
    first.unmount();

    const second = render(
      await AiToolsListPage({ searchParams: Promise.resolve({ page: "2" }) }),
    );
    const links = [...second.container.querySelectorAll("ul a")].map((anchor) =>
      anchor.getAttribute("href"),
    );
    expect(links).toEqual(["/en/startups/startup-25"]);
    expect(
      second.container.querySelector("a[href='/en/startups/ai-tools-list']")
        ?.textContent,
    ).toContain("Previous");
    const secondData = listedItems(second.container);
    expect(secondData.url).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/en/startups/ai-tools-list?page=2`,
    );
    expect(secondData.mainEntity.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Startup 25",
        url: `${CANONICAL_PRODUCTION_ORIGIN}/en/startups/startup-25`,
      },
    ]);
  });
});
