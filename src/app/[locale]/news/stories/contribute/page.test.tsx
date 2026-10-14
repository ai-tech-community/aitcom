import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  topics: [] as Array<{
    title: string;
    topicKey: string;
    articleIds: string[];
    newestAt: string;
  }>,
  fail: false,
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespace as never,
    }),
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
vi.mock("@/server/news/weekly-topics", () => ({
  listWeeklyStoryTopics: async () => {
    if (state.fail) throw new Error("unavailable");
    return state.topics;
  },
}));
vi.mock("@/components/news/contribute-desk", () => ({
  ContributeDesk: ({ topics }: { topics: { title: string }[] }) => (
    <section>
      {topics.map((topic) => (
        <p key={topic.title}>{topic.title}</p>
      ))}
    </section>
  ),
}));
vi.mock("@/components/news/storyline-preview", () => ({
  StorylinePreview: () => <div>preview</div>,
}));

import ContributePage, { generateMetadata } from "./page";

beforeEach(() => {
  state.topics = [];
  state.fail = false;
});

const show = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );

it("sets a noindex self-canonical title and description", async () => {
  const meta = await generateMetadata();
  expect(meta.title).toBe(en.newsStories.contribute.metaTitle);
  expect(meta.description).toBe(en.newsStories.contribute.metaDescription);
  expect(meta.robots).toEqual({ index: false, follow: true });
  expect(meta.alternates?.canonical).toBe(
    "https://www.aitcommunity.org/en/news/stories/contribute",
  );
});

it("explains the two-step flow, the reward, and hides topics when the week has none", async () => {
  show(await ContributePage());
  expect(
    screen.getByText(en.newsStories.contribute.howSteps),
  ).toBeInTheDocument();
  expect(
    screen.getByText(en.newsStories.contribute.howExample),
  ).toBeInTheDocument();
  expect(
    screen.getByText(en.newsStories.contribute.rewardsBody),
  ).toBeInTheDocument();
  expect(screen.queryByText("Open models reach")).not.toBeInTheDocument();
});

it("shows only topics returned from stored headlines and hides them when the lookup fails", async () => {
  state.topics = [
    {
      title: "Open models reach",
      topicKey: "open-models-reach",
      articleIds: ["a", "b"],
      newestAt: "2026-10-14T00:00:00.000Z",
    },
  ];
  const view = show(await ContributePage());
  expect(screen.getByText("Open models reach")).toBeInTheDocument();
  view.unmount();
  state.fail = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  show(await ContributePage());
  expect(screen.queryByText("Open models reach")).not.toBeInTheDocument();
  log.mockRestore();
});
