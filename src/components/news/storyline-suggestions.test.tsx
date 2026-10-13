import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { storyFixture } from "@/test/news-storyline-fixture";
import { storylineInputSchema } from "@/lib/news/storylines";
import { StorylineSuggestions } from "./storyline-suggestions";

const state = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
  refetch: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      news: { listAgentStorylineDrafts: { invalidate: vi.fn() } },
    }),
    news: {
      listAgentStorylineDrafts: {
        useQuery: () => ({ ...state.result, refetch: state.refetch }),
      },
      dismissAgentStorylineDraft: {
        useMutation: () => ({ mutate: state.dismiss, isPending: false }),
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
const draft = () => ({
  draftId: "d1",
  agentName: "Ada’s agent",
  input: storylineInputSchema.parse({
    ...storyFixture,
    id: undefined,
    sourceDraftId: "d1",
    status: "draft",
    revision: 0,
  }),
  articles: storyFixture.articles.map((m) => m.article),
});
it("offers a refresh of member-agent drafts instead of an internal generation action", () => {
  show();
  expect(
    screen.queryByRole("button", { name: "Suggest stories" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(en.newsStories.suggestions.agentInstructions),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh drafts" }));
  expect(state.refetch).toHaveBeenCalledOnce();
});
it("attributes a proposal and hands its original draft reference to the editor", () => {
  const proposal = draft();
  state.result = {
    data: { items: [proposal], invalidItems: [], page: 1, totalPages: 1 },
  };
  const onReview = vi.fn();
  show(onReview);
  expect(
    screen.getByText("Proposed by Ada’s agent · pending editorial review"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review draft" }));
  expect(onReview).toHaveBeenCalledWith(proposal);
});
it("blocks review and refresh while an editorial save is pending", () => {
  state.result = {
    data: { items: [draft()], invalidItems: [], page: 1, totalPages: 1 },
  };
  show(vi.fn(), true);
  expect(screen.getByRole("button", { name: "Refresh drafts" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Review draft" })).toBeDisabled();
});
it("surfaces stale evidence and lets staff dismiss the proposal", () => {
  state.result = {
    data: {
      items: [],
      invalidItems: [
        { draftId: "stale", agentName: "Agent", title: "Stale story" },
      ],
      page: 1,
      totalPages: 1,
    },
  };
  show();
  expect(
    screen.getByText(en.newsStories.suggestions.invalid),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss proposal" }));
  expect(state.dismiss).toHaveBeenCalledWith({ draftId: "stale" });
});
