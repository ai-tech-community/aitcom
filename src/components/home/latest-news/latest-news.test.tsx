import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import { LatestNews } from "./latest-news";
import type { HomeNewsItem } from "@/server/news/home";
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const items: HomeNewsItem[] = [
  {
    id: "news",
    kind: "news",
    title: "A daily headline",
    summary: "What happened today.",
    href: "https://example.com/news",
    source: "Example",
    date: "2026-10-18T12:00:00Z",
    englishFallback: false,
  },
  {
    id: "story",
    kind: "story",
    title: "The bigger story",
    summary: "How it connects.",
    href: "/news/stories/the-bigger-story",
    source: null,
    date: "2026-10-17T12:00:00Z",
    englishFallback: true,
  },
];
function show(data = items, locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <LatestNews items={data} />
    </NextIntlClientProvider>,
  );
}
describe("LatestNews", () => {
  it("shows both kinds with dates and direct reading links", () => {
    const { container } = show();
    expect(
      screen.getByRole("region", { name: en.homeNews.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "A daily headline" }),
    ).toHaveAttribute("href", "https://example.com/news");
    expect(
      screen.getByRole("link", { name: "The bigger story" }),
    ).toHaveAttribute("href", "/news/stories/the-bigger-story");
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      items[0]!.date,
    );
    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.homeNews.allNews }),
    ).toHaveAttribute("href", "/news");
    expect(
      screen.getByRole("link", { name: en.homeNews.allStories }),
    ).toHaveAttribute("href", "/news/stories");
  });
  it("leaves no empty section when both sources are unavailable", () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });
  it("localizes labels and identifies English editorial copy", () => {
    show(items, "nl");
    expect(
      screen.getByRole("region", { name: nl.homeNews.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(nl.homeNews.englishFallback)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The bigger story" }),
    ).toHaveAttribute("lang", "en");
  });
});
