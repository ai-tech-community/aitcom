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
  });

  it("is noindex", async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("uses the directory width and a two-column grid", async () => {
    state.items = [
      {
        id: "story-1",
        url: "https://example.com/models",
        title: "New models",
        author: "Ada",
        publishedAt: new Date("2026-10-11T00:00:00.000Z"),
        summary: "What shipped.",
      },
    ];
    render(await NewsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("main").className).toContain("max-w-6xl");
    expect(screen.getByRole("list").className).toContain("lg:grid-cols-2");
    const link = screen.getByRole("link", { name: "New models" });
    expect(link).toHaveAttribute("href", "https://example.com/models");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
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
    expect(screen.getByText("Heard it at the meetup.")).toBeInTheDocument();
    expect(screen.getByText(/Member rumor · Unverified/)).toBeInTheDocument();
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByText("staff actions")).not.toBeInTheDocument();
  });

  it("shows staff controls and the form only to the people who can use them", async () => {
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
    expect(screen.getByText("rumor form")).toBeInTheDocument();
    expect(screen.getByText("staff actions")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Weights dropped" }),
    ).toHaveAttribute("href", "https://example.com/weights");
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
