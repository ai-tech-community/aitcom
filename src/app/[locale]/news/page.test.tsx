import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
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
  serverTotal: null as number | null,
  board: [] as Array<{
    userId: string;
    name: string;
    profilePath: string;
    points: number;
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

vi.mock("@/server/news/storylines", () => ({
  articleStorylineLinks: async () => [
    {
      articleId: "older",
      slug: "local-ai",
      titleEn: "AI on devices",
      titleNl: "",
    },
  ],
}));
vi.mock("@/components/news/storyline-preview", () => ({
  StorylinePreview: () => <section>Ongoing stories</section>,
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

vi.mock("@/server/news/table-page", () => ({
  queryNewsTablePage: async (input: {
    query: {
      q: string;
      type: "all" | "verified" | "rumor";
      source: string;
      company: string;
      writer: string;
      sort: "date" | "title" | "source";
      page: number;
      story: string;
    };
    includeHiddenRumors: boolean;
    memberSource: string;
  }) => {
    const table = await import("@/lib/news/table");
    const rumors = input.includeHiddenRumors
      ? state.rumors
      : state.rumors.filter((rumor) => rumor.hiddenAt == null);
    const rows = table.buildNewsTableRows(
      state.items,
      rumors,
      [],
      { memberSource: input.memberSource },
      state.links,
    );
    const facets = table.newsTableFacets(rows);
    if (state.serverTotal != null) {
      const total = state.serverTotal;
      return {
        stories: state.items,
        rumors,
        order: rows.map((row) => ({ kind: row.kind, id: row.id })),
        total,
        page: 1,
        totalPages: Math.max(1, Math.ceil(total / table.NEWS_PAGE_SIZE)),
        sources: facets.sources,
        writers: facets.writers,
        companies: facets.companies,
      };
    }
    const result = table.applyNewsTableQuery(rows, input.query);
    const stories: typeof state.items = [];
    const pageRumors: typeof rumors = [];
    for (const item of result.items) {
      if (item.kind === "story") {
        const story = state.items.find((row) => row.id === item.id);
        if (story) stories.push(story);
      } else {
        const rumor = rumors.find((row) => row.id === item.id);
        if (rumor) pageRumors.push(rumor);
      }
    }
    return {
      stories,
      rumors: pageRumors,
      order: result.items.map((item) => ({ kind: item.kind, id: item.id })),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      sources: facets.sources,
      writers: facets.writers,
      companies: facets.companies,
    };
  },
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

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicNewsDialog(props: { label?: string }) {
      if (!props.label) return null;
      return <button type="button">{props.label}</button>;
    },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    rel?: string;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => "/news",
}));

vi.mock("@/server/news/directory", () => ({
  listNewsDirectoryCompanies: async () => [],
}));

vi.mock("@/server/news/startup-links", () => ({
  listNewsStartupLinks: async () => state.links,
}));

vi.mock("@/server/news/contributions", () => ({
  listWeeklyContributorBoard: async () => state.board,
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
    state.serverTotal = null;
    state.rumors = [];
    state.links = { stories: {}, rumors: {} };
    state.board = [];
  });

  it("is noindex and keeps its canonical unset", async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toBeUndefined();
  });

  it("links News and Stories as tabs, with News current", async () => {
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    const nav = screen.getByRole("navigation", {
      name: en.newsPage.tabsLabel,
    });
    const news = within(nav).getByRole("link", { name: en.newsPage.tabNews });
    const stories = within(nav).getByRole("link", {
      name: en.newsPage.tabStories,
    });
    expect(news).toHaveAttribute("href", "/news");
    expect(news).toHaveAttribute("aria-current", "page");
    expect(news).not.toHaveAttribute("tabindex", "-1");
    expect(stories).toHaveAttribute("href", "/news/stories");
    expect(stories).not.toHaveAttribute("aria-current");
    expect(stories.className).not.toContain("border-primary");
    expect(news.className).toContain("border-foreground");
  });

  it("shows an empty weekly board that links to contributing", async () => {
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { name: en.newsPage.leaderboardTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.newsPage.leaderboardEmpty }),
    ).toHaveAttribute("href", "/news/stories/contribute");
  });

  it("lists this week's public contributors with their stored names", async () => {
    state.board = [
      {
        userId: "ada",
        name: "Ada Lovelace",
        profilePath: "/members/ada",
        points: 60,
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute(
      "href",
      "/members/ada",
    );
    expect(screen.getByText("60 pts")).toBeInTheDocument();
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
    const writer = screen.getByRole("link", { name: "Ada" });
    expect(writer).toHaveAttribute("href", "/news?writer=Ada");
    expect(writer).toHaveAttribute("rel", "nofollow");
    expect(document.getElementById("news-story-1")).toContainElement(writer);
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
    const writer = screen.getByRole("link", { name: "Ada Lovelace" });
    expect(writer).toHaveAttribute("href", "/news?writer=Ada+Lovelace");
    expect(writer).toHaveAttribute("rel", "nofollow");
    expect(document.getElementById("rumor-rumor-1")).toContainElement(writer);
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
      screen.getByRole("link", { name: nl.newsPage.leaderboardEmpty }),
    ).toHaveAttribute("href", "/news/stories/contribute");
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

  it("filters by writer from the cell, the select, and a clearable chip", async () => {
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
        author: "Grace",
        publishedAt: new Date("2026-10-10T00:00:00.000Z"),
        summary: "Nothing named.",
      },
    ];
    const listed = render(
      await NewsPage({
        searchParams: Promise.resolve({
          q: "week",
          type: "verified",
          sort: "title",
          page: "4",
        }),
      }),
    );
    const row = document.getElementById("news-story-2");
    expect(row?.className).toContain("block");
    const writer = within(row!).getByRole("link", {
      name: "Grace",
    });
    expect(writer).toHaveAttribute(
      "href",
      "/news?q=week&type=verified&writer=Grace&sort=title",
    );
    expect(writer).toHaveAttribute("rel", "nofollow");
    expect(
      screen.getByRole("columnheader", { name: "Title" }).querySelector("a"),
    ).toHaveAttribute("rel", "nofollow");
    listed.unmount();

    render(
      await NewsPage({
        searchParams: Promise.resolve({
          writer: "Ada",
          q: "ships",
          company: "openai",
        }),
      }),
    );
    expect(screen.getByRole("combobox", { name: "Writer" })).toHaveValue("Ada");
    expect(screen.getByText("OpenAI ships new models")).toBeInTheDocument();
    expect(screen.queryByText("A quiet week")).not.toBeInTheDocument();
    const chip = screen.getByRole("link", { name: "Clear writer Ada" });
    expect(chip).toHaveAttribute("href", "/news?q=ships&company=openai");
    expect(chip).toHaveAttribute("rel", "nofollow");
    expect(chip.parentElement).toHaveTextContent("Ada");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/news",
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "rel",
      "nofollow",
    );
  });

  it("keeps an unknown writer in the filter and still noindexes the page", async () => {
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
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
    render(
      await NewsPage({ searchParams: Promise.resolve({ writer: "Nobody" }) }),
    );
    expect(screen.getByRole("combobox", { name: "Writer" })).toHaveValue(
      "Nobody",
    );
    expect(screen.getByText("No matching stories.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Clear writer Nobody" }),
    ).toHaveAttribute("href", "/news");
  });

  it("marks pagination links nofollow", async () => {
    state.items = Array.from({ length: 21 }, (_, index) => ({
      id: `story-${index}`,
      url: `https://example.com/${index}`,
      title: `Story ${index}`,
      author: "Ada",
      publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
      summary: "A line.",
    }));
    const first = render(
      await NewsPage({ searchParams: Promise.resolve({ writer: "Ada" }) }),
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "rel",
      "nofollow",
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/news?writer=Ada&page=2",
    );
    first.unmount();
    render(
      await NewsPage({
        searchParams: Promise.resolve({ writer: "Ada", page: "2" }),
      }),
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "rel",
      "nofollow",
    );
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/news?writer=Ada",
    );
  });

  it("shows the counted total when more than 400 stories are stored", async () => {
    state.serverTotal = 517;
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
    expect(screen.getByText("517 results")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 26")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/news?page=2",
    );
    expect(screen.getByText("OpenAI ships new models")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "AI on devices" })).toHaveAttribute(
      "href",
      "/news/stories/local-ai#article-older",
    );
    expect(screen.getByRole("link", { name: "Older story" })).toHaveAttribute(
      "href",
      "https://example.com/older",
    );
  });
});
