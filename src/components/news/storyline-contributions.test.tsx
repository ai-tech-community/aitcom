import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { StorylineContributions } from "./storyline-contributions";

const state = vi.hoisted(() => ({
  authStatus: "authenticated",
  board: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    isFetching: false,
  },
  agent: {
    data: { name: "Atlas", status: "active" } as {
      name: string;
      status: string;
    } | null,
    isPending: false,
    isError: false,
  },
  coverage: {
    data: { state: "available", slug: null as string | null },
    isError: false,
    isFetching: false,
  },
  requireAuth: vi.fn(),
  refresh: vi.fn(),
  copy: vi.fn(),
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: state.authStatus,
    requireAuth: state.requireAuth,
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
vi.mock("@/trpc/react", () => ({
  api: {
    news: {
      listStorylineResearch: {
        useQuery: () => ({ ...state.board, refetch: state.refresh }),
      },
      storylineCoverage: {
        useQuery: () => ({ ...state.coverage, refetch: state.refresh }),
      },
    },
    agentManagement: {
      getMyAgent: {
        useQuery: () => ({ ...state.agent, refetch: state.refresh }),
      },
    },
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.authStatus = "authenticated";
  state.board = {
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
  };
  state.agent = {
    data: { name: "Atlas", status: "active" },
    isPending: false,
    isError: false,
  };
  state.coverage = {
    data: { state: "available", slug: null },
    isError: false,
    isFetching: false,
  };
  state.requireAuth.mockImplementation((fn: () => void) => {
    if (state.authStatus === "authenticated") fn();
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: state.copy.mockResolvedValue(undefined) },
  });
});
const show = (locale = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "nl" ? nl : en}
      timeZone="UTC"
    >
      <StorylineContributions />
    </NextIntlClientProvider>,
  );
const topic = () =>
  fireEvent.change(screen.getByLabelText(en.newsStories.contribute.topic), {
    target: { value: "Open models" },
  });
it("prepares and copies a brief for the owner's runtime without dispatching work", async () => {
  show();
  topic();
  fireEvent.click(
    screen.getByRole("button", { name: en.newsStories.contribute.prepare }),
  );
  expect(
    screen.getByLabelText<HTMLTextAreaElement>(
      en.newsStories.contribute.briefReady,
    ).value,
  ).toContain("For Atlas");
  fireEvent.click(
    screen.getByRole("button", { name: en.newsStories.contribute.copy }),
  );
  await waitFor(() => expect(state.copy).toHaveBeenCalledOnce());
  expect(state.copy.mock.calls[0]?.[0]).toContain("reserve-news-storyline");
  fireEvent.change(screen.getByLabelText(en.newsStories.contribute.topic), {
    target: { value: "Different topic" },
  });
  expect(
    screen.queryByLabelText(en.newsStories.contribute.briefReady),
  ).not.toBeInTheDocument();
});
it("gates a guest's brief preparation through the existing auth dialog", () => {
  state.authStatus = "guest";
  show();
  topic();
  fireEvent.click(
    screen.getByRole("button", { name: en.newsStories.contribute.prepare }),
  );
  expect(state.requireAuth).toHaveBeenCalledWith(
    expect.any(Function),
    en.newsStories.contribute.signIn,
  );
  expect(
    screen.queryByLabelText(en.newsStories.contribute.briefReady),
  ).not.toBeInTheDocument();
});
it("blocks duplicate research and points readers at the published shared result", () => {
  state.coverage.data = { state: "published", slug: "open-models" };
  show();
  topic();
  expect(
    screen.getByRole("button", { name: en.newsStories.contribute.prepare }),
  ).toBeDisabled();
  expect(
    screen.getByRole("link", { name: en.newsStories.contribute.readStory }),
  ).toHaveAttribute("href", "/news/stories/open-models");
});
it("blocks unchecked coverage and gives board errors a retry", () => {
  state.coverage.isError = true;
  state.board.isError = true;
  show();
  topic();
  expect(
    screen.getByRole("button", { name: en.newsStories.contribute.prepare }),
  ).toBeDisabled();
  fireEvent.click(screen.getAllByRole("button", { name: en.common.retry })[0]!);
  expect(state.refresh).toHaveBeenCalledOnce();
});
it("shows ghost-safe attribution and shared review state", () => {
  state.board.data = [
    {
      topicKey: "open-models",
      title: "Open models",
      state: "awaiting_editors",
      agentName: null,
      slug: null,
      expiresAt: null,
    },
  ];
  show();
  expect(
    screen.getByText(en.newsStories.contribute.memberAgent),
  ).toBeInTheDocument();
  expect(
    screen.getByText(en.newsStories.contribute.awaiting_editors),
  ).toBeInTheDocument();
});
it("teaches members without an agent how to connect one and renders Dutch copy", () => {
  state.agent.data = null;
  show("nl");
  expect(
    screen.getByRole("link", { name: nl.newsStories.contribute.connectAgent }),
  ).toHaveAttribute("href", "/dashboard/agent?tab=connect");
  expect(
    screen.queryByRole("button", { name: nl.newsStories.contribute.prepare }),
  ).not.toBeInTheDocument();
});

it("does not prepare a brief whose topic would collide with a static route", () => {
  show();
  fireEvent.change(screen.getByLabelText(en.newsStories.contribute.topic), {
    target: { value: "Contribute" },
  });
  expect(
    screen.getByText(en.newsStories.contribute.invalidTopic),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: en.newsStories.contribute.prepare }),
  ).toBeDisabled();
});
