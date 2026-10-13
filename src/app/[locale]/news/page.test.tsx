import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "nl",
  extra: null as null | {
    id: string;
    url: string;
    title: string;
    author: string | null;
    publishedAt: Date | null;
    summary: string;
    aiSummary?: string | null;
  },
  signedIn: false,
  staff: false,
  items: [] as Array<{
    id: string;
    url: string;
    title: string;
    author: string | null;
    publishedAt: Date | null;
    summary: string;
    aiSummary?: string | null;
  }>,
  rumors: [] as Array<{
    id: string;
    title: string;
    url: string | null;
    body: string;
    submitterName: string;
    createdAt: Date;
    hiddenAt: Date | null;
  }>,
  links: {
    stories: {} as Record<
      string,
      Array<{
        id: string;
        slug: string;
        name: string;
        homepage: string;
        logoUrl: string | null;
      }>
    >,
    rumors: {} as Record<
      string,
      Array<{
        id: string;
        slug: string;
        name: string;
        homepage: string;
        logoUrl: string | null;
      }>
    >,
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: state.locale,
      messages: state.locale === "nl" ? nl : en,
      namespace: namespace as never,
    }),
}));

vi.mock("@/server/news/list", () => ({
  listNewsItems: async () => state.items,
  findNewsItem: async (id: string) =>
    state.items.find((item) => item.id === id) ?? state.extra,
}));

vi.mock("@/server/news/rumors", () => ({
  listNewsRumors: async () => state.rumors,
}));

vi.mock("@/server/news/staff", () => ({
  isNewsStaff: async () => state.staff,
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () =>
    state.signedIn
      ? { user: { id: "user-1", email: "ada@example.com", name: "Ada" } }
      : null,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/server/news/directory", () => ({
  listNewsDirectoryCompanies: async () => [],
}));

vi.mock("@/server/news/startup-links", () => ({
  listNewsStartupLinks: async () => state.links,
}));

vi.mock("@/components/news/news-rumor-form", () => ({
  NewsRumorForm: () => <form>rumor form</form>,
}));

vi.mock("@/components/news/news-rumor-actions", () => ({
  NewsRumorActions: () => <div>staff actions</div>,
}));

import NewsPage, { generateMetadata } from "./page";

describe("news page", () => {
  beforeEach(() => {
    state.locale = "en";
    state.signedIn = false;
    state.staff = false;
    state.items = [];
    state.extra = null;
    state.rumors = [];
    state.links = { stories: {}, rumors: {} };
  });

  it("is noindex", async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("renders a directory-width table with a verified story", async () => {
    state.items = [
      {
        id: "story-1",
        url: "https://example.com/models",
        title: "OpenAI ships new models",
        author: "Ada",
        publishedAt: new Date("2026-10-11T00:00:00.000Z"),
        summary: "What shipped.",
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("main").className).toContain("max-w-6xl");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Title" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Verified", { selector: "[data-slot=badge]" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "OpenAI ships new models" });
    expect(link).toHaveAttribute("href", "https://example.com/models");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("img", { name: "OpenAI" })).toHaveAttribute(
      "src",
      "https://openai.com/favicon.ico",
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(document.getElementById("news-story-1")?.className).toContain(
      "md:table-row",
    );
    expect(document.getElementById("news-story-1")?.className).toContain(
      "block",
    );
    expect(
      screen.queryByRole("button", { name: "Share a rumor" }),
    ).not.toBeInTheDocument();
  });

  it("uses the published MIT Technology Review icon, not /favicon.ico", async () => {
    state.items = [
      {
        id: "story-mit",
        url: "https://www.technologyreview.com/2026/10/01/briefing/",
        title: "A measured look at chips",
        author: null,
        publishedAt: new Date("2026-10-11T00:00:00.000Z"),
        summary: "What the lab published.",
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("img", {
        name: "MIT Technology Review — Artificial intelligence",
      }),
    ).toHaveAttribute(
      "src",
      "https://www.technologyreview.com/static/media/favicon.1cfcdb44759a0f93ddf5feb5405dd4cc.ico",
    );
  });

  it("links a stored startup match to its directory profile", async () => {
    state.items = [
      {
        id: "story-1",
        url: "https://example.com/models",
        title: "A quiet week",
        author: "Ada",
        publishedAt: new Date("2026-10-11T00:00:00.000Z"),
        summary: "Nothing named.",
        aiSummary: null,
      },
    ];
    state.links = {
      stories: {
        "story-1": [
          {
            id: "startup-1",
            slug: "northstar-labs",
            name: "Northstar Labs",
            homepage: "https://northstar.example",
            logoUrl: "https://cdn.northstar.example/logo.png",
          },
        ],
      },
      rumors: {},
    };
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    const link = screen.getByRole("link", { name: "Northstar Labs" });
    expect(link).toHaveAttribute("href", "/startups/northstar-labs");
    expect(link.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.northstar.example/logo.png",
    );
  });

  it("filters the table from the URL query", async () => {
    state.items = [
      {
        id: "story-1",
        url: "https://example.com/models",
        title: "OpenAI ships new models",
        author: "Ada",
        publishedAt: new Date("2026-10-11T00:00:00.000Z"),
        summary: "What shipped.",
      },
      {
        id: "story-2",
        url: "https://example.com/quiet",
        title: "A quiet week",
        author: null,
        publishedAt: new Date("2026-10-10T00:00:00.000Z"),
        summary: "Nothing named.",
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({ q: "quiet" }) }));
    expect(screen.getByText("A quiet week")).toBeInTheDocument();
    expect(
      screen.queryByText("OpenAI ships new models"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/news",
    );
  });

  it("labels a member rumor as unverified and names the submitter", async () => {
    state.rumors = [
      {
        id: "rumor-1",
        title: "Weights dropped",
        url: null,
        body: "Heard it at the meetup.",
        submitterName: "Ada Lovelace",
        createdAt: new Date("2026-10-12T00:00:00.000Z"),
        hiddenAt: null,
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Weights dropped")).toBeInTheDocument();
    expect(screen.getByText("Heard it at the meetup.")).toHaveClass(
      "line-clamp-2",
    );
    expect(screen.getByText("Unverified rumor")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("staff actions")).not.toBeInTheDocument();
  });

  it("shows staff controls and the rumor dialog only to the people who can use them", async () => {
    state.signedIn = true;
    state.staff = true;
    state.rumors = [
      {
        id: "rumor-1",
        title: "Weights dropped",
        url: "https://example.com/weights",
        body: "Heard it at the meetup.",
        submitterName: "Ada Lovelace",
        createdAt: new Date("2026-10-12T00:00:00.000Z"),
        hiddenAt: null,
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("button", { name: "Share a rumor" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sign in to submit a rumor" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("staff actions")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Weights dropped" }),
    ).toHaveAttribute("href", "https://example.com/weights");
  });

  it("shows a stored summary under the title and finds it from the query", async () => {
    state.items = [
      {
        id: "story-1",
        url: "https://example.com/lab",
        title: "Lab note",
        author: "Ada",
        publishedAt: new Date("2026-10-11T00:00:00.000Z"),
        summary: "<p>Raw feed excerpt about widgets.</p>",
        aiSummary: "A stored TL;DR about lattices.",
      },
    ];
    const { unmount } = render(
      await NewsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByText("A stored TL;DR about lattices.")).toHaveClass(
      "line-clamp-2",
    );
    expect(screen.queryByText(/widgets/)).not.toBeInTheDocument();
    unmount();
    const lattices = render(
      await NewsPage({ searchParams: Promise.resolve({ q: "lattices" }) }),
    );
    expect(screen.getByText("Lab note")).toBeInTheDocument();
    lattices.unmount();
    render(await NewsPage({ searchParams: Promise.resolve({ q: "widgets" }) }));
    expect(screen.getByText("Lab note")).toBeInTheDocument();
  });

  it("shows the Dutch empty state", async () => {
    state.locale = "nl";
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Nog geen verhalen.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Log in om een gerucht in te sturen" }),
    ).toHaveAttribute("href", "/auth/signin");
  });

  it("puts News in the Challenges slot and moves Challenges into More", () => {
    const navbar = readFileSync(
      join(process.cwd(), "src/components/navbar.tsx"),
      "utf8",
    );
    expect(navbar).toMatch(
      /href: "\/news", key: "news", shortcut: "N", primary: true/,
    );
    expect(navbar).toMatch(
      /href: "\/challenges", key: "challenges", shortcut: "G", primary: false/,
    );
    expect(en.nav.news).toBe("News");
    expect(nl.nav.news).toBe("Nieuws");
    expect(Object.keys(en.newsPage).sort()).toEqual(
      Object.keys(nl.newsPage).sort(),
    );
  });

  it("shows a story the digest linked even when it is outside the list", async () => {
    state.extra = {
      id: "older",
      url: "https://example.com/older",
      title: "Older story",
      author: null,
      publishedAt: new Date("2026-09-01T00:00:00.000Z"),
      summary: "Still here.",
    };
    render(
      await NewsPage({ searchParams: Promise.resolve({ story: "older" }) }),
    );
    expect(document.getElementById("news-older")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Older story" })).toHaveAttribute(
      "href",
      "https://example.com/older",
    );
  });
});
