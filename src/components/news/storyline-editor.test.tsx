import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import { storyFixture } from "@/test/news-storyline-fixture";
import { storylineInputSchema } from "@/lib/news/storylines";
import { StorylineEditor } from "./storyline-editor";

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  articleRows: [] as unknown[],
  storyRows: [] as unknown[],
  detail: null as unknown,
  suggestion: null as unknown,
  refetch: vi.fn(),
  options: null as null | { onError: (err: { message: string }) => void },
}));
vi.mock("./storyline-suggestions", () => ({
  StorylineSuggestions: ({
    onReview,
  }: {
    onReview: (draft: unknown) => void;
  }) => (
    <div>
      Suggestions
      {!!state.suggestion && (
        <button type="button" onClick={() => onReview(state.suggestion)}>
          Review generated draft
        </button>
      )}
    </div>
  ),
}));
vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      news: {
        listStorylines: { invalidate: vi.fn() },
        listAgentStorylineDrafts: { invalidate: vi.fn() },
        readStoryline: { invalidate: vi.fn() },
      },
    }),
    news: {
      listStorylines: {
        useQuery: () => ({
          data: { items: state.storyRows, page: 1, totalPages: 1 },
        }),
      },
      readStoryline: {
        useQuery: () => ({ data: state.detail, refetch: state.refetch }),
      },
      searchStorylineArticles: {
        useQuery: () => ({
          data: { items: state.articleRows, page: 1, totalPages: 1 },
        }),
      },
      saveStoryline: {
        useMutation: (options: typeof state.options) => {
          state.options = options;
          return { mutate: state.mutate, isPending: false };
        },
      },
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.mutate.mockReset();
  state.refetch.mockReset();
  state.storyRows = [];
  state.detail = null;
  state.suggestion = null;
  state.articleRows = storyFixture.articles.slice(0, 2).map((m) => m.article);
});
function editor() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <StorylineEditor />
    </NextIntlClientProvider>,
  );
}
it("saves a new draft without demanding publication-ready evidence", () => {
  editor();
  fireEvent.change(screen.getByLabelText("URL slug", { exact: false }), {
    target: { value: "local-ai" },
  });
  fireEvent.change(screen.getByLabelText("Title · English"), {
    target: { value: "Local AI" },
  });
  expect(screen.getByRole("button", { name: "Publish story" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(state.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "draft",
      titleEn: "Local AI",
      articles: [],
    }),
  );
});
it("publishes only after two articles have contribution notes and matching evidence", () => {
  editor();
  fireEvent.change(screen.getByLabelText("URL slug", { exact: false }), {
    target: { value: "local-ai" },
  });
  fireEvent.change(screen.getByLabelText("Title · English"), {
    target: { value: "Local AI" },
  });
  fireEvent.change(screen.getByLabelText("Overview · English"), {
    target: { value: "A shift to devices" },
  });
  for (const button of screen.getAllByRole("button", {
    name: "Add to timeline",
  }))
    fireEvent.click(button);
  for (const note of screen.getAllByLabelText(
    "What this article adds · English",
  ))
    fireEvent.change(note, { target: { value: "A meaningful development" } });
  const evidence = screen.getAllByLabelText("Source evidence", {
    exact: false,
  });
  for (let i = 0; i < evidence.length; i++)
    fireEvent.change(evidence[i]!, {
      target: { value: storyFixture.articles[i]!.evidence },
    });
  fireEvent.click(screen.getByRole("button", { name: "Publish story" }));
  expect(state.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "published",
      articles: expect.any(Array),
    }),
  );
  expect(
    screen.queryByRole("link", { name: "View published story" }),
  ).not.toBeInTheDocument();
});
it("shows a stale-save recovery message without discarding the draft", () => {
  editor();
  fireEvent.change(screen.getByLabelText("Title · English"), {
    target: { value: "My unsaved edit" },
  });
  // Exercise the mutation's server error path as React would deliver it.
  state.mutate.mockImplementation(() =>
    state.options?.onError({ message: "stale" }),
  );
  fireEvent.change(screen.getByLabelText("URL slug", { exact: false }), {
    target: { value: "local-ai" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    en.newsStories.errors.stale,
  );
  expect(screen.getByLabelText("Title · English")).toHaveValue(
    "My unsaved edit",
  );
});

it("blocks story switching while a save is pending", () => {
  editor();
  fireEvent.change(screen.getByLabelText("URL slug", { exact: false }), {
    target: { value: "local-ai" },
  });
  fireEvent.change(screen.getByLabelText("Title · English"), {
    target: { value: "Local AI" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByRole("button", { name: "New story" })).toBeDisabled();
});

it("locks navigation and preserves edits until a stale-story reload settles", async () => {
  state.storyRows = [storyFixture];
  state.detail = storyFixture;
  let finishReload: (result: { error: null }) => void = () => {};
  state.refetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishReload = resolve;
      }),
  );
  state.mutate.mockImplementation(() =>
    state.options?.onError({ message: "stale" }),
  );
  editor();
  fireEvent.click(
    screen.getByRole("button", { name: /AI is moving onto your devices/ }),
  );
  fireEvent.change(screen.getByLabelText("Title · English"), {
    target: { value: "My unsaved revision" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved story" }));
  await waitFor(() => expect(state.refetch).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "New story" })).toBeDisabled();
  expect(screen.getByLabelText("Title · English")).toHaveValue(
    "My unsaved revision",
  );
  await act(async () => finishReload({ error: null }));
  expect(screen.getByRole("button", { name: "New story" })).toBeEnabled();
  expect(screen.getByLabelText("Title · English")).toHaveValue(
    storyFixture.titleEn,
  );
});

it("opens a generated proposal with editable source evidence without automatically saving", async () => {
  state.suggestion = {
    input: storylineInputSchema.parse({
      ...storyFixture,
      id: undefined,
      status: "draft",
      revision: 0,
    }),
    articles: storyFixture.articles.map((m) => m.article),
  };
  editor();
  fireEvent.click(
    screen.getByRole("button", { name: "Review generated draft" }),
  );
  expect(screen.getByLabelText("Title · English")).toHaveValue(
    storyFixture.titleEn,
  );
  expect(screen.getByLabelText("URL slug", { exact: false })).toBeEnabled();
  expect(
    screen.getAllByLabelText("Source evidence", { exact: false })[0],
  ).toHaveValue(storyFixture.articles[0]!.evidence);
  expect(state.mutate).not.toHaveBeenCalled();
});
