import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../../../messages/en.json";
import { storyFixture } from "@/test/news-storyline-fixture";

const state = vi.hoisted(() => ({
  staff: false,
  find: vi.fn(),
  list: vi.fn(),
  related: vi.fn(),
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
vi.mock("@/components/news/storyline-editor", () => ({
  StorylineEditor: () => <div>Staff editor</div>,
}));
import StoriesPage from "./page";
import StoryPage from "./[slug]/page";
import ManageStoriesPage from "./manage/page";

beforeEach(() => {
  vi.clearAllMocks();
  state.staff = false;
  state.find.mockResolvedValue(storyFixture);
  state.related.mockResolvedValue([]);
  state.list.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 });
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
it("keeps the editor inaccessible to ordinary members", async () => {
  await expect(ManageStoriesPage()).rejects.toThrow("NEXT_NOT_FOUND");
  state.staff = true;
  show(await ManageStoriesPage());
  expect(screen.getByText("Staff editor")).toBeInTheDocument();
});
