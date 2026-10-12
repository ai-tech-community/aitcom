import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "nl",
  items: [] as Array<{
    id: string;
    url: string;
    title: string;
    author: string | null;
    publishedAt: Date | null;
    summary: string;
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
}));

import NewsPage, { generateMetadata } from "./page";

describe("news page", () => {
  beforeEach(() => {
    state.locale = "en";
    state.items = [];
  });

  it("is noindex", async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("links each story out to the article", async () => {
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
    render(await NewsPage());
    const link = screen.getByRole("link", { name: "New models" });
    expect(link).toHaveAttribute("href", "https://example.com/models");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(document.getElementById("news-story-1")).not.toBeNull();
    expect(screen.getByText("What shipped.")).toBeInTheDocument();
  });

  it("shows the Dutch empty state", async () => {
    state.locale = "nl";
    render(await NewsPage());
    expect(screen.getByText("Nog geen verhalen.")).toBeInTheDocument();
  });
});
