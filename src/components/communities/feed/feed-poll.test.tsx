import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import type { FeedPollView } from "@/lib/poll-rules";

const m = vi.hoisted(() => ({
  vote: vi.fn(),
  requireAuth: vi.fn(),
  signedIn: true,
  next: null as FeedPollView | null,
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: (action: () => void, reason: string) => {
      m.requireAuth(reason);
      if (m.signedIn) action();
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getFeed: { invalidate: vi.fn() },
        getActivity: { invalidate: vi.fn() },
      },
    }),
    feed: {
      votePoll: {
        useMutation: (opts: {
          onSuccess: (
            next: FeedPollView | null,
            input: { optionId: string | null },
          ) => void;
        }) => ({
          mutate: (input: { postId: number; optionId: string | null }) => {
            m.vote(input);
            opts.onSuccess(m.next, input);
          },
          isPending: false,
        }),
      },
    },
  },
}));

import { FeedPoll } from "./feed-poll";

const open: FeedPollView = {
  options: [
    { id: "a", label: "Pizza", votes: 2 },
    { id: "b", label: "Tacos", votes: 1 },
  ],
  totalVotes: 3,
  closesAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  closed: false,
  myVote: null,
};

function renderPoll(
  poll: FeedPollView,
  viewer: "member" | "guest" | "outsider" = "member",
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} now={new Date()}>
      <FeedPoll postId={7} poll={poll} viewer={viewer} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  m.signedIn = true;
});

describe("FeedPoll", () => {
  it("votes with one tap, then shows the results with the member's answer", () => {
    m.next = {
      ...open,
      options: [
        { id: "a", label: "Pizza", votes: 2 },
        { id: "b", label: "Tacos", votes: 2 },
      ],
      totalVotes: 4,
      myVote: "b",
    };
    renderPoll(open);
    // The counts stay hidden until the member votes.
    expect(screen.queryByText("67%")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tacos" }));
    expect(m.vote).toHaveBeenCalledWith({ postId: 7, optionId: "b" });

    const tacos = screen.getByText("Tacos").closest("li")!;
    expect(within(tacos).getByText("(your vote)")).toBeInTheDocument();
    expect(within(tacos).getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText("4 votes")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your vote is counted.",
    );
    // The pressed button is gone: focus moves to what comes next.
    expect(
      screen.getByRole("button", { name: "Take back vote" }),
    ).toHaveFocus();
  });

  it("takes a vote back", () => {
    m.next = { ...open, myVote: null };
    renderPoll({ ...open, myVote: "a" });
    fireEvent.click(screen.getByRole("button", { name: "Take back vote" }));
    expect(m.vote).toHaveBeenCalledWith({ postId: 7, optionId: null });
    expect(screen.getByRole("button", { name: "Pizza" })).toHaveFocus();
  });

  it("shows only results once closed, or to someone who cannot vote", () => {
    renderPoll({ ...open, closed: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Final results")).toBeInTheDocument();
    expect(screen.getByText(/67%/)).toBeInTheDocument();
  });

  it("asks a visitor to sign in before voting", () => {
    m.signedIn = false;
    renderPoll(open, "guest");
    fireEvent.click(screen.getByRole("button", { name: "Pizza" }));
    expect(m.requireAuth).toHaveBeenCalledWith("Sign in to vote");
    expect(m.vote).not.toHaveBeenCalled();
  });

  it("shows a signed-in non-member the results and how to vote", () => {
    renderPoll(open, "outsider");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Closes in 2 days/)).toBeInTheDocument();
    expect(
      screen.getByText("Join this community to vote."),
    ).toBeInTheDocument();
  });
});
