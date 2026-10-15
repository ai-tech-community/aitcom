import { fireEvent, render, screen } from "@testing-library/react";
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
  boardFail: false,
  board: [] as Array<{
    userId: string;
    name: string;
    profilePath: string;
    image: string | null;
    agentName: string | null;
    points: number;
  }>,
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
vi.mock("@/server/news/contributions", () => ({
  listWeeklyContributorBoard: async () => {
    if (state.boardFail) throw new Error("unavailable");
    return state.board;
  },
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <span data-avatar-src={src} data-avatar-alt={alt ?? ""} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
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
  state.board = [];
  state.boardFail = false;
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

it("shows this week's contributors as the human and their visible agent", async () => {
  state.board = [
    {
      userId: "ada",
      name: "Ada Lovelace",
      profilePath: "/members/ada",
      image: null,
      agentName: "Scout",
      points: 60,
    },
    {
      userId: "grace",
      name: "Grace Hopper",
      profilePath: "/members/grace",
      image: "https://cdn.example/grace.jpg",
      agentName: null,
      points: 20,
    },
  ];
  show(await ContributePage());
  fireEvent.click(
    screen.getByText(en.newsStories.contribute.contributorsTitle),
  );
  expect(
    screen.getByRole("heading", { name: en.newsPage.leaderboardTitle }),
  ).toBeInTheDocument();
  const ada = screen.getByRole("link", { name: "Ada Lovelace" });
  expect(ada).toHaveAttribute("href", "/members/ada");
  expect(ada.querySelector("[data-avatar-src]")).toBeNull();
  expect(ada).toHaveTextContent("AL");
  expect(screen.getByText("Agent: Scout")).toBeInTheDocument();
  expect(screen.getByText("60 pts")).toBeInTheDocument();
  const grace = screen.getByRole("link", { name: "Grace Hopper" });
  expect(grace.querySelector("[data-avatar-src]")).toHaveAttribute(
    "data-avatar-src",
    "https://cdn.example/grace.jpg",
  );
  expect(grace.querySelector("[data-avatar-src]")).toHaveAttribute(
    "data-avatar-alt",
    "",
  );
  expect(screen.queryByText(/Connected agent/)).not.toBeInTheDocument();
});

it("keeps the contribution desk usable when the leaderboard lookup fails", async () => {
  state.boardFail = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  show(await ContributePage());
  expect(
    screen.getByText(en.newsStories.contribute.howSteps),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByText(en.newsStories.contribute.contributorsTitle),
  );
  expect(
    screen.getByRole("link", { name: en.newsPage.leaderboardEmpty }),
  ).toHaveAttribute("href", "/news/stories/contribute");
  log.mockRestore();
});

it("keeps instructions and rewards collapsed and removes the duplicate story list", async () => {
  show(await ContributePage());
  expect(
    screen.getByRole("link", { name: en.newsStories.contribute.backStories }),
  ).toHaveAttribute("href", "/news/stories");
  const instructions = screen
    .getByText(en.newsStories.contribute.howTitle)
    .closest("details");
  expect(instructions).not.toHaveAttribute("open");
  expect(
    screen
      .getByText(en.newsStories.contribute.contributorsTitle)
      .closest("details"),
  ).not.toHaveAttribute("open");
  expect(screen.queryByText("preview")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText(en.newsStories.contribute.howTitle));
  expect(instructions).toHaveAttribute("open");
  expect(
    screen.getByRole("heading", {
      name: en.newsStories.contribute.rewardsTitle,
    }),
  ).toBeInTheDocument();
});
