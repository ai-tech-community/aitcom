import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import type { WeeklyTopic } from "@/lib/news/weekly-topics";

import { ContributeDesk } from "./contribute-desk";

const topic: WeeklyTopic = {
  title: "EU AI Act",
  topicKey: "eu-ai-act",
  articleIds: ["a1"],
  newestAt: "2026-10-14T00:00:00.000Z",
};

const state = vi.hoisted(() => ({
  mutate: vi.fn(async () => ({
    ok: true as const,
    alreadyClaimed: false,
    pointsAwarded: 10,
    expiresAt: new Date("2026-10-15T12:00:00.000Z"),
    firstScoop: false,
  })),
  seedTopic: null as string | null,
  seedToken: 0,
  claims: [] as Array<{
    topicKey: string;
    title: string;
    expiresAt: Date | null;
  }>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: "authenticated" as const,
    requireAuth: (fn: () => void) => fn(),
  }),
}));
vi.mock("./story-suggestion-box", () => ({ StorySuggestionBox: () => null }));
vi.mock("./storyline-contributions", () => ({
  StorylineContributions: ({
    seedTopic = null,
    seedToken = 0,
  }: {
    seedTopic?: string | null;
    seedToken?: number;
  }) => {
    state.seedTopic = seedTopic;
    state.seedToken = seedToken;
    return null;
  },
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      news: {
        myStoryClaims: { invalidate: async () => undefined },
        storyCoverageToday: { invalidate: async () => undefined },
      },
    }),
    agentManagement: {
      getMyAgent: {
        useQuery: () => ({ data: { status: "active", name: "Ada" } }),
      },
    },
    news: {
      myStoryClaims: { useQuery: () => ({ data: state.claims }) },
      storyCoverageToday: {
        useQuery: () => ({
          data: { covered: 1, total: 5, visible: true },
        }),
      },
      claimStoryTopic: {
        useMutation: () => ({ mutateAsync: state.mutate }),
      },
    },
  },
}));

import { toast } from "sonner";

beforeEach(() => {
  vi.clearAllMocks();
  state.seedTopic = null;
  state.seedToken = 0;
  state.claims = [];
  window.history.replaceState({}, "", "/#agent-research");
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(async () => undefined) },
  });
});

it("claims a topic from a button and never a link", async () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ContributeDesk topics={[topic]} />
    </NextIntlClientProvider>,
  );
  const button = screen.getByRole("button", {
    name: en.newsStories.contribute.claim,
  });
  expect(button).toHaveAttribute("type", "button");
  expect(button).not.toHaveAttribute("href");
  expect(
    screen.queryByRole("link", { name: en.newsStories.contribute.claim }),
  ).toBeNull();
  expect(container.querySelector('a[href*="claim"]')).toBeNull();
  expect(container.querySelector('a[href*="eu-ai-act"]')).toBeNull();

  fireEvent.click(button);
  await waitFor(() => {
    expect(state.mutate).toHaveBeenCalledWith({
      topicKey: "eu-ai-act",
      title: "EU AI Act",
    });
  });
  expect(state.seedTopic).toBe("EU AI Act");
  expect(state.seedToken).toBe(1);
  expect(toast.success).toHaveBeenCalledWith(
    en.newsStories.contribute.topicApplied.replace("{title}", topic.title),
  );

  fireEvent.click(button);
  await waitFor(() => expect(state.seedToken).toBe(2));
  expect(state.seedTopic).toBe("EU AI Act");
  expect(screen.getByText("1 article this week")).toBeInTheDocument();
});

const show = () => (
  <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <ContributeDesk topics={[topic]} />
  </NextIntlClientProvider>
);

it("defers agent research in the initial HTML and shows its countdown when opened", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00.000Z"));
  state.claims = [
    {
      topicKey: "eu-ai-act",
      title: "EU AI Act",
      expiresAt: new Date("2026-10-15T12:00:00.000Z"),
    },
  ];
  try {
    const html = renderToString(show());
    expect(html).not.toContain("2026-10-15T12:00:00.000Z");
    expect(html).not.toContain("Reserved until");
    expect(html).not.toContain("24h 0m 0s left");

    render(show());
    expect(screen.getByText("24h 0m 0s left")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("23h 59m 59s left")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps agent tools hidden until requested", async () => {
  window.history.replaceState({}, "", "/");
  render(show());
  expect(
    screen.queryByRole("button", { name: en.newsStories.contribute.claim }),
  ).not.toBeInTheDocument();
  expect(state.seedToken).toBe(0);
  fireEvent.click(screen.getByText(en.newsStories.contribute.agentPath));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: en.newsStories.contribute.claim }),
    ).toBeInTheDocument(),
  );
});
