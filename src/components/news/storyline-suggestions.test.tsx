import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { storyFixture } from "@/test/news-storyline-fixture";
import { storylineInputSchema } from "@/lib/news/storylines";
import { StorylineSuggestions } from "./storyline-suggestions";

const state = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
  mutate: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    news: {
      suggestStorylines: {
        useMutation: () => ({ ...state.result, mutate: state.mutate }),
      },
    },
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() => {
  state.result = {};
  vi.clearAllMocks();
});
const show = (onReview = vi.fn(), locked = false) =>
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorylineSuggestions locked={locked} onReview={onReview} />
    </NextIntlClientProvider>,
  );
it("requests suggestions only after the editor explicitly starts generation", () => {
  show();
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Suggest stories" }));
  expect(state.mutate).toHaveBeenCalledOnce();
});
it("labels proposals as unsaved AI drafts and hands a chosen draft to the editor", () => {
  const draft = {
    input: storylineInputSchema.parse({
      ...storyFixture,
      id: undefined,
      status: "draft",
      revision: 0,
    }),
    articles: storyFixture.articles.map((m) => m.article),
  };
  state.result = { isSuccess: true, data: { drafts: [draft], discarded: 0 } };
  const onReview = vi.fn();
  show(onReview);
  expect(screen.getByText("AI draft · not saved")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review draft" }));
  expect(onReview).toHaveBeenCalledWith(draft);
});
it("blocks generation and review while the editor is locked", () => {
  const draft = {
    input: storylineInputSchema.parse({
      ...storyFixture,
      id: undefined,
      status: "draft",
      revision: 0,
    }),
    articles: storyFixture.articles.map((m) => m.article),
  };
  state.result = { isSuccess: true, data: { drafts: [draft], discarded: 0 } };
  show(vi.fn(), true);
  expect(
    screen.getByRole("button", { name: "Suggest stories" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Review draft" })).toBeDisabled();
});
it("shows provider failures with a recovery path", () => {
  state.result = { error: { message: "provider" } };
  show();
  expect(screen.getByRole("alert")).toHaveTextContent(
    en.newsStories.suggestions.errors.provider,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(state.mutate).toHaveBeenCalledOnce();
});
