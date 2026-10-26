import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { buildAlternates } from "@/lib/metadata";

import {
  AI_TOOLS_LIST_COPY,
  AI_TOOLS_LIST_PATH,
  aiToolsListCopy,
} from "./ai-tools-list";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "nl" }));

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
});

describe("AI tools list copy", () => {
  it("is a complete English sentence without listing notes", () => {
    const { title, description } = AI_TOOLS_LIST_COPY.en;
    expect(title).toBe("AI tools");
    expect(description.endsWith(".")).toBe(true);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).not.toMatch(NOTES);
    expect(title).not.toMatch(NOTES);
    expect(description).not.toMatch(/AI TOOLS LIST/);
    expect(description).not.toContain("AIAI.Tools");
    expect(aiToolsListCopy("nl").description).not.toContain("AIAI.Tools");
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
    const meta = await generateMetadata();
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
    const meta = await generateMetadata();
    expect(meta.title).toBe("AI-tools");
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(
      `${CANONICAL_PRODUCTION_ORIGIN}/nl${AI_TOOLS_LIST_PATH}`,
    );
  });
});

describe("AI tools list sitemap", () => {
  it("is a static sitemap path", () => {
    const sitemap = readFileSync(join(dir, "../../app/sitemap.ts"), "utf8");
    expect(sitemap).toContain(`"${AI_TOOLS_LIST_PATH}"`);
  });
});
