import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { buildAlternates } from "@/lib/metadata";

import {
  AI_TOOLS_LIST_COPY,
  AI_TOOLS_LIST_PATH,
  AI_TOOLS_LIST_TOOLS,
  aiToolsHubPageHref,
  aiToolsHubProfileHref,
  aiToolsHubProfileUrl,
  aiToolsListCopy,
  aiToolsListJsonLd,
  aiToolsOnPage,
  isAiToolsHubStartup,
} from "./ai-tools-list";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "nl",
  cards: [] as Array<{ name: string; slug: string }>,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async () => (key: string) => key,
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => null,
}));

vi.mock("@/server/startups/queries", () => ({
  findApprovedPublicStartupBySlug: async () => null,
  listOpenStartupRolesForCompany: async () => [],
  listAiToolsHubStartups: async () => state.cards,
}));

vi.mock("@/server/news/startup-links", () => ({
  listStartupNewsMentions: async () => [],
}));

import { generateMetadata } from "@/app/[locale]/startups/ai-tools-list/page";

const NOTES =
  /todo|fixme|listing policy|do not invent|never invent|source\s*:|internal note|writing rule/i;

const dir = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  state.locale = "en";
  state.cards = [];
});

describe("AI tools list copy", () => {
  it("is a complete English sentence without listing notes", () => {
    const { title, description } = AI_TOOLS_LIST_COPY.en;
    expect(title).toBe("AI tools");
    expect(description.endsWith(".")).toBe(true);
    expect(description.length).toBeGreaterThanOrEqual(120);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(aiToolsListCopy("nl").description.length).toBeGreaterThanOrEqual(
      120,
    );
    expect(aiToolsListCopy("nl").description.length).toBeLessThanOrEqual(155);
    expect(description).not.toMatch(NOTES);
    expect(description).not.toMatch(/\d/);
    expect(aiToolsListCopy("nl").description).not.toMatch(/\d/);
    expect(title).not.toMatch(NOTES);
    expect(description).not.toMatch(/AI TOOLS LIST/);
    expect(description).not.toContain("AIAI.Tools");
    expect(aiToolsListCopy("nl").description).not.toContain("AIAI.Tools");
    expect(description).not.toMatch(/rank|how many/i);
    expect(aiToolsListCopy("nl").description).not.toMatch(/rangschikt|aantal/i);
    expect(AI_TOOLS_LIST_COPY.en.intro).not.toBe(description);
    expect(AI_TOOLS_LIST_COPY.nl.intro).not.toBe(
      aiToolsListCopy("nl").description,
    );
    expect(AI_TOOLS_LIST_COPY.en.intro).not.toMatch(/rank|how many/i);
    expect(AI_TOOLS_LIST_COPY.nl.intro).not.toMatch(/rangschikt|aantal/i);
  });

  it("has a Dutch counterpart for the same route", () => {
    expect(aiToolsListCopy("nl").title).toBe("AI-tools");
    expect(aiToolsListCopy("nl").description.endsWith(".")).toBe(true);
    expect(aiToolsListCopy("en").description).not.toBe(
      aiToolsListCopy("nl").description,
    );
  });
});

describe("AI tools list hreflang", () => {
  it("pairs en and nl and points x-default at the English URL", () => {
    const en = buildAlternates(AI_TOOLS_LIST_PATH, "en");
    const nl = buildAlternates(AI_TOOLS_LIST_PATH, "nl");
    const enUrl = `${CANONICAL_PRODUCTION_ORIGIN}/en${AI_TOOLS_LIST_PATH}`;
    const nlUrl = `${CANONICAL_PRODUCTION_ORIGIN}/nl${AI_TOOLS_LIST_PATH}`;

    expect(en.canonical).toBe(enUrl);
    expect(nl.canonical).toBe(nlUrl);
    expect(en.languages.en).toBe(enUrl);
    expect(en.languages.nl).toBe(nlUrl);
    expect(nl.languages.en).toBe(enUrl);
    expect(nl.languages.nl).toBe(nlUrl);
    expect(en.languages["x-default"]).toBe(enUrl);
    expect(nl.languages["x-default"]).toBe(enUrl);
  });
});

describe("AI tools list metadata", () => {
  it("indexes the English page with a self canonical and no noindex", async () => {
    const meta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe("AI tools");
    expect(meta.description).toBe(AI_TOOLS_LIST_COPY.en.description);
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/en${AI_TOOLS_LIST_PATH}`,
    );
    expect(JSON.stringify(meta.robots)).not.toMatch(/noindex/i);
  });

  it("keeps the Dutch page self-canonical", async () => {
    state.locale = "nl";
    const meta = await generateMetadata({
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe("AI-tools");
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/nl${AI_TOOLS_LIST_PATH}`,
    );
  });

  it("keeps a later page self-canonical and links the previous page", async () => {
    state.cards = Array.from({ length: 25 }, (_, index) => ({
      name: `Startup ${index + 1}`,
      slug: `startup-${index + 1}`,
    }));
    const meta = await generateMetadata({
      searchParams: Promise.resolve({ page: "2" }),
    });
    const pageUrl = `${CANONICAL_PRODUCTION_ORIGIN}/en${AI_TOOLS_LIST_PATH}?page=2`;
    expect(meta.alternates?.canonical).toBe(pageUrl);
    expect(meta.alternates?.languages).toMatchObject({
      en: pageUrl,
      nl: `${CANONICAL_PRODUCTION_ORIGIN}/nl${AI_TOOLS_LIST_PATH}?page=2`,
    });
    expect(meta.pagination).toEqual({
      previous: `${CANONICAL_PRODUCTION_ORIGIN}/en${AI_TOOLS_LIST_PATH}`,
    });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});

describe("AI tools list structured data", () => {
  it("is a CollectionPage whose ItemList is the listed tools, or none", () => {
    const data = aiToolsListJsonLd("en");
    expect(data["@type"]).toBe("CollectionPage");
    expect(data.url).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/en${AI_TOOLS_LIST_PATH}`,
    );
    const list = data.mainEntity as {
      "@type": string;
      itemListElement: unknown[];
    };
    expect(list["@type"]).toBe("ItemList");
    expect(list.itemListElement).toEqual([]);
    expect(AI_TOOLS_LIST_TOOLS).toEqual([]);
    expect(JSON.stringify(data)).not.toMatch(
      /Organization|AI TOOLS LIST|aiai\.tools/i,
    );

    const listed = aiToolsListJsonLd("nl", [
      { name: "Example Tool", url: "https://example.com/tool" },
    ]);
    const items = (
      listed.mainEntity as { itemListElement: Array<Record<string, unknown>> }
    ).itemListElement;
    expect(items).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Example Tool",
        url: "https://example.com/tool",
      },
    ]);
    expect(listed.url).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/nl${AI_TOOLS_LIST_PATH}`,
    );

    const pageTwo = aiToolsListJsonLd(
      "en",
      [
        {
          name: "Later",
          url: "https://www.aitcommunity.org/en/startups/later",
        },
      ],
      2,
    );
    expect(pageTwo.url).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/en${AI_TOOLS_LIST_PATH}?page=2`,
    );
  });

  it("keeps only named tools with an http(s) URL", () => {
    expect(
      aiToolsOnPage([
        { name: "Writer", url: "https://example.com/writer" },
        { name: "  ", url: "https://example.com/blank" },
        { name: "Skipped", url: "javascript:alert(1)" },
      ]),
    ).toEqual([{ name: "Writer", url: "https://example.com/writer" }]);
  });
});

describe("AI tools hub startup set", () => {
  const long = "a".repeat(80);
  const short = "a".repeat(79);

  it("keeps indexable agents and models and drops thin or other categories", () => {
    expect(
      isAiToolsHubStartup({
        slug: "agent-co",
        category: "agents",
        description: long,
        openRoleCount: 0,
      }),
    ).toBe(true);
    expect(
      isAiToolsHubStartup({
        slug: "agent-co",
        category: "agents",
        description: short,
        openRoleCount: 0,
      }),
    ).toBe(false);
    expect(
      isAiToolsHubStartup({
        slug: "agent-co",
        category: "agents",
        description: `  ${short}  `,
        openRoleCount: 0,
      }),
    ).toBe(false);
    expect(
      isAiToolsHubStartup({
        slug: "agent-co",
        category: "agents",
        description: "Hi",
        openRoleCount: 1,
      }),
    ).toBe(true);
    expect(
      isAiToolsHubStartup({
        slug: "model-co",
        category: "models",
        description: long,
        openRoleCount: 0,
      }),
    ).toBe(true);
    expect(
      isAiToolsHubStartup({
        slug: "vert",
        category: "vertical",
        description: long,
        openRoleCount: 0,
      }),
    ).toBe(false);
    expect(
      isAiToolsHubStartup({
        slug: "blank",
        category: "agents",
        description: "",
        openRoleCount: 0,
      }),
    ).toBe(false);
  });

  it("links a startup to its locale profile", () => {
    expect(aiToolsHubProfileHref("en", "acme")).toBe("/en/startups/acme");
    expect(aiToolsHubProfileHref("nl", "acme")).toBe("/nl/startups/acme");
    expect(aiToolsHubProfileUrl("nl", "acme")).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/nl/startups/acme`,
    );
    expect(aiToolsHubPageHref("en", 1)).toBe(`/en${AI_TOOLS_LIST_PATH}`);
    expect(aiToolsHubPageHref("nl", 2)).toBe(`/nl${AI_TOOLS_LIST_PATH}?page=2`);
  });
});

describe("AI tools list sitemap", () => {
  it("is a static sitemap path", () => {
    const sitemap = readFileSync(join(dir, "../../app/sitemap.ts"), "utf8");
    expect(sitemap).toContain(`"${AI_TOOLS_LIST_PATH}"`);
  });
});

describe("AI tools list route", () => {
  it("does not render the startup record", () => {
    const page = readFileSync(
      join(dir, "../../app/[locale]/startups/ai-tools-list/page.tsx"),
      "utf8",
    );
    expect(page).not.toContain("StartupsProfilePage");
    expect(page).not.toContain("findApprovedPublicStartupBySlug");
    expect(page).not.toContain("startupProfileJsonLd");
    expect(page).toContain("listAiToolsHubStartups");
    expect(page).toContain("paginateStartupCards");
  });
});
