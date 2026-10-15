import { render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { storyFixture } from "@/test/news-storyline-fixture";

const state = vi.hoisted(() => ({
  staff: false,
  find: vi.fn(),
  list: vi.fn(),
  related: vi.fn(),
  board: vi.fn(),
  topics: vi.fn(),
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/news/stories",
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
vi.mock("@/server/news/storylines", () => ({
  findStoryline: state.find,
  listStorylines: state.list,
  relatedStorylines: state.related,
}));
vi.mock("@/server/news/staff", () => ({
  isNewsStaff: async () => state.staff,
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => ({ user: { email: "member@example.org" } }),
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({
    children,
    size: _size,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { size?: string }) => (
    <span {...props}>{children}</span>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <span data-avatar-src={src} data-avatar-alt={alt ?? ""} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/news/storyline-vote", () => ({
  StorylineVoteControls: () => <div>Story votes</div>,
}));
vi.mock("@/components/news/storyline-editor", () => ({
  StorylineEditor: () => <div>Staff editor</div>,
}));
vi.mock("@/components/news/storyline-draft-queue", () => ({
  StorylineDraftQueue: () => <div>Draft queue</div>,
}));
vi.mock("@/components/news/story-suggestion-inbox", () => ({
  StorySuggestionInbox: () => <div>Suggestion inbox</div>,
}));
vi.mock("@/server/news/contributions", () => ({
  listWeeklyContributorBoard: state.board,
}));
vi.mock("@/server/news/weekly-topics", () => ({
  listWeeklyStoryTopics: state.topics,
}));
import StoriesPage, { generateMetadata as storiesMetadata } from "./page";
import StoryPage, { generateMetadata as storyMetadata } from "./[slug]/page";
import ManageStoriesPage from "./manage/page";

beforeEach(() => {
  vi.clearAllMocks();
  state.staff = false;
  state.find.mockResolvedValue(storyFixture);
  state.related.mockResolvedValue([]);
  state.list.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 });
  state.board.mockResolvedValue([]);
  state.topics.mockResolvedValue([]);
});
const show = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  );
it("distinguishes an empty index from a failed load", async () => {
  const view = show(await StoriesPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText(en.newsStories.empty)).toBeInTheDocument();
  view.unmount();
  state.list.mockRejectedValue(new Error("unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  show(await StoriesPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    en.newsStories.unavailable,
  );
  log.mockRestore();
});
it("preserves the search query when paging storylines", async () => {
  state.list.mockResolvedValue({
    items: [],
    total: 24,
    page: 2,
    totalPages: 3,
  });
  show(
    await StoriesPage({
      searchParams: Promise.resolve({ q: "local AI", page: "2" }),
    }),
  );
  expect(state.list).toHaveBeenCalledWith({ q: "local AI", page: 2 });
  expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
    "href",
    "/news/stories?q=local+AI&page=3",
  );
});
it("returns 404 for missing or nonpublic stories, but renders explicit storage failures", async () => {
  state.find.mockResolvedValue(null);
  await expect(
    StoryPage({ params: Promise.resolve({ slug: "draft" }) }),
  ).rejects.toThrow("NEXT_NOT_FOUND");
  state.find.mockRejectedValue(new Error("database unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  show(await StoryPage({ params: Promise.resolve({ slug: "published" }) }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    en.newsStories.unavailable,
  );
  log.mockRestore();
});
it("keeps the stories index noindex without a new canonical", async () => {
  const meta = await storiesMetadata();
  expect(meta.robots).toEqual({ index: false, follow: true });
  expect(meta.alternates).toBeUndefined();
});
it("leads with published stories and keeps contribution tools off the reader index", async () => {
  state.list.mockResolvedValue({
    items: [
      {
        ...storyFixture,
        articleCount: 3,
        latestAt: "2026-10-13T00:00:00.000Z",
        credit: { human: null, agentName: null },
      },
    ],
    total: 1,
    page: 1,
    totalPages: 1,
  });
  show(await StoriesPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    en.newsStories.title,
  );
  expect(
    screen.getByRole("textbox", { name: en.newsStories.search }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: storyFixture.titleEn }),
  ).toHaveAttribute("href", `/news/stories/${storyFixture.slug}`);
  expect(
    screen.getByRole("link", { name: en.newsStories.contribute.entry }),
  ).toHaveAttribute("href", "/news/stories/contribute");
  expect(
    screen.queryByRole("heading", { name: en.newsPage.leaderboardTitle }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Weekly topics" }),
  ).not.toBeInTheDocument();
  expect(state.board).not.toHaveBeenCalled();
  expect(state.topics).not.toHaveBeenCalled();
});
it("links News and Stories as tabs, with Stories current", async () => {
  show(await StoriesPage({ searchParams: Promise.resolve({}) }));
  const nav = screen.getByRole("navigation", { name: en.newsPage.tabsLabel });
  const news = within(nav).getByRole("link", { name: en.newsPage.tabNews });
  const stories = within(nav).getByRole("link", {
    name: en.newsPage.tabStories,
  });
  expect(news).toHaveAttribute("href", "/news");
  expect(news).not.toHaveAttribute("aria-current");
  expect(stories).toHaveAttribute("href", "/news/stories");
  expect(stories).toHaveAttribute("aria-current", "page");
  expect(stories).not.toHaveAttribute("tabindex", "-1");
});
it("keeps story pages noindex", async () => {
  const meta = await storyMetadata({
    params: Promise.resolve({ slug: "published" }),
  });
  expect(meta.robots).toEqual({ index: false, follow: true });
});
it("keeps the editor inaccessible to ordinary members", async () => {
  await expect(ManageStoriesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  state.staff = true;
  show(await ManageStoriesPage());
  expect(screen.getByText("Staff editor")).toBeInTheDocument();
  expect(screen.getByText("Draft queue")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Review queue" })).toHaveAttribute(
    "href",
    "/news/stories/drafts",
  );
});
