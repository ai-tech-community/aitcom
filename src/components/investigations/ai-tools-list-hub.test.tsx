import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AI_TOOLS_LIST_COPY } from "@/lib/investigations/ai-tools-list";

vi.mock("server-only", () => ({}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
}));

vi.mock("@/server/startups/queries", () => ({
  findApprovedPublicStartupBySlug: async () => ({
    id: "aiai",
    name: "AI TOOLS LIST",
    slug: "ai-tools-list",
    homepage: "https://aiai.tools",
    description:
      "AIAI.Tools, explore the limitless potential of AI and unleash your creative passion.",
    category: "vertical",
    region: "Hoorn",
    openRoleCount: 0,
    sources: ["https://www.eu-startups.com/directory/ai-tools-list"],
  }),
}));

import { AiToolsListHub } from "./ai-tools-list-hub";
import AiToolsListPage from "@/app/[locale]/startups/ai-tools-list/page";

describe("AI tools hub page", () => {
  it("shows its own intro and a CollectionPage, even if the startup row exists", async () => {
    const page = render(await AiToolsListPage());
    const intro = page.container.querySelector("p.text-muted-foreground");
    expect(intro?.textContent).toBe(AI_TOOLS_LIST_COPY.en.intro);
    expect(intro?.textContent).not.toBe(AI_TOOLS_LIST_COPY.en.description);
    expect(page.container.textContent).not.toContain("AI TOOLS LIST");
    expect(page.container.textContent).not.toContain("limitless");
    expect(page.container.textContent).not.toContain("aiai.tools");

    const data = JSON.parse(
      page.container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "{}",
    ) as {
      "@type": string;
      mainEntity: { "@type": string; itemListElement: unknown[] };
    };
    expect(data["@type"]).toBe("CollectionPage");
    expect(data.mainEntity["@type"]).toBe("ItemList");
    expect(data.mainEntity.itemListElement).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("Organization");
    page.unmount();

    const dutch = render(<AiToolsListHub locale="nl" />);
    expect(
      dutch.container.querySelector("p.text-muted-foreground")?.textContent,
    ).toBe(AI_TOOLS_LIST_COPY.nl.intro);
    dutch.unmount();

    const mixed = render(
      <AiToolsListHub
        locale="en"
        tools={[
          { name: "Writer", url: "https://example.com/writer" },
          { name: "Skipped", url: "javascript:alert(1)" },
        ]}
      />,
    );
    const links = [...mixed.container.querySelectorAll("ul a")].map(
      (anchor) => ({
        name: anchor.textContent,
        url: anchor.getAttribute("href"),
      }),
    );
    const listed = JSON.parse(
      mixed.container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "{}",
    ) as { mainEntity: { itemListElement: unknown[] } };
    expect(links).toEqual([
      { name: "Writer", url: "https://example.com/writer" },
    ]);
    expect(listed.mainEntity.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Writer",
        url: "https://example.com/writer",
      },
    ]);
  });
});
