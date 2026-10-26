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
    expect(intro?.textContent).toBe(AI_TOOLS_LIST_COPY.en.description);
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
    ).toBe(AI_TOOLS_LIST_COPY.nl.description);
  });
});
