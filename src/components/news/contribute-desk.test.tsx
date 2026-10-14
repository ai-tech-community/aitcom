import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  StorylineContributions: () => null,
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
      myStoryClaims: { useQuery: () => ({ data: [] }) },
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

beforeEach(() => {
  vi.clearAllMocks();
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
});
