import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { storyFixture } from "@/test/news-storyline-fixture";
import { StorylineList, StorylineReader } from "./storyline-reader";

vi.mock("./storyline-vote", () => ({
  StorylineVoteControls: ({ score }: { score: number }) => (
    <div>Score {score}</div>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
function reader(locale = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "nl" ? nl : en}
      timeZone="UTC"
    >
      <StorylineReader story={storyFixture} related={[]} />
    </NextIntlClientProvider>,
  );
}
it("lets readers reach the latest development, inspect source evidence, and open original reporting", () => {
  reader();
  expect(
    screen.getByText("example.org · Example Research"),
  ).toBeInTheDocument();
  expect(document.querySelector("header time")).toHaveAttribute(
    "dateTime",
    "2026-10-13T00:00:00.000Z",
  );
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "AI is moving onto your devices",
  );
  expect(
    screen.getByRole("link", { name: "Latest development" }),
  ).toHaveAttribute("href", "#article-launch");
  const evidence = screen.getAllByText("Source evidence")[0]!;
  fireEvent.click(evidence);
  expect(evidence.closest("details")).toHaveAttribute("open");
  expect(
    screen.getByText(
      "A compact model handles useful tasks on consumer hardware.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: "Read the original article" })[0],
  ).toHaveAttribute("href", "https://example.org/research");
  expect(
    screen.getByRole("heading", { name: "What is still unresolved?" }),
  ).toBeInTheDocument();
});
it("makes English fallback visible within a Dutch interface", () => {
  reader("nl");
  expect(
    screen.getByRole("heading", { name: "Hoe zijn we hier gekomen?" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText(nl.newsStories.fallback)).toHaveLength(4);
  expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
    "lang",
    "en",
  );
});
it("uses stable storyline URLs from the ongoing-story list", () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorylineList
        items={[
          {
            ...storyFixture,
            articleCount: 3,
            latestAt: "2026-10-13T00:00:00.000Z",
            score: 4,
            myVote: "up",
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByRole("link", { name: "AI is moving onto your devices" }),
  ).toHaveAttribute("href", "/news/stories/ai-on-your-devices");
  expect(screen.getByText("3 articles")).toBeInTheDocument();
  expect(screen.getByText("Score 4")).toBeInTheDocument();
});
it("explains an incoming relationship with sources from both stories", () => {
  const target = {
    ...storyFixture,
    id: "energy",
    slug: "energy",
    titleEn: "AI’s growing electricity demand",
  };
  const evidence = storyFixture.articles
    .slice(0, 2)
    .map((m, i) => ({ ...m, storylineId: i ? "energy" : "devices" }));
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorylineReader
        story={storyFixture}
        related={[
          {
            sourceId: "energy",
            targetId: "devices",
            relation: "builds_on",
            explanationEn:
              "This coverage examines the effects of local processing.",
            explanationNl: "",
            fromArticleId: "research",
            toArticleId: "hardware",
            incoming: true,
            target,
            evidence,
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("Builds on this story")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Why are these connected?"));
  expect(
    screen.getByText("This coverage examines the effects of local processing."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "AI’s growing electricity demand" }),
  ).toHaveAttribute("href", "/news/stories/energy");
});
