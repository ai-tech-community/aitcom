import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";

const session = vi.hoisted(() => ({
  value: {
    data: null as { user: { id: string } } | null,
    isPending: false,
    error: null as Error | null,
  },
}));
const mutate = vi.hoisted(() => vi.fn());

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => session.value },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/news/stories",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/trpc/react", () => ({
  api: {
    news: {
      castStorylineVote: {
        useMutation: () => ({ mutate, isPending: false }),
      },
    },
  },
}));

import { toast } from "sonner";
import { AuthRequiredProvider } from "@/components/auth/auth-required-dialog";
import { StorylineVoteControls } from "./storyline-vote";

function show(props: { score?: number; myVote?: "up" | "down" | null } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AuthRequiredProvider>
        <StorylineVoteControls
          storyId="story-1"
          score={props.score ?? 0}
          myVote={props.myVote ?? null}
        />
      </AuthRequiredProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
  session.value = { data: null, isPending: false, error: null };
});

it("asks a guest to sign in and does not expose a vote URL", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Vote up" }));
  expect(mutate).not.toHaveBeenCalled();
  const signIn = screen.getByRole("link", { name: /sign in/i });
  expect(signIn.getAttribute("href")).toBe(
    "/auth/signin?redirect=%2Fen%2Fnews%2Fstories",
  );
  expect(signIn.getAttribute("href")).not.toContain("vote");
  expect(screen.queryByRole("link", { name: /vote/i })).not.toBeInTheDocument();
  for (const button of screen.getAllByRole("button")) {
    expect(button).toHaveAttribute("type", "button");
  }
});

it("updates the score immediately, then restores it and toasts when the save fails", async () => {
  session.value = {
    data: { user: { id: "member" } },
    isPending: false,
    error: null,
  };
  show({ score: 3, myVote: null });
  fireEvent.click(screen.getByRole("button", { name: "Vote up" }));
  expect(screen.getByText("4")).toBeInTheDocument();
  expect(mutate).toHaveBeenCalledWith(
    { storyId: "story-1", vote: "up" },
    expect.objectContaining({ onError: expect.any(Function) }),
  );
  const options = mutate.mock.calls[0]?.[1] as {
    onError: (error: { data?: { code?: string } }) => void;
    onSuccess: (result: {
      score: number;
      myVote: "up" | "down" | null;
    }) => void;
  };
  await act(async () => {
    options.onError({});
  });
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalledWith(
    "Your vote was not saved. Try again.",
  );

  fireEvent.click(screen.getByRole("button", { name: "Vote down" }));
  expect(screen.getByText("2")).toBeInTheDocument();
  const down = mutate.mock.calls.at(-1)?.[1] as {
    onSuccess: (result: {
      score: number;
      myVote: "up" | "down" | null;
    }) => void;
  };
  await act(async () => {
    down.onSuccess({ score: 2, myVote: "down" });
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove vote" }));
  expect(mutate).toHaveBeenLastCalledWith(
    { storyId: "story-1", vote: "clear" },
    expect.any(Object),
  );
  expect(screen.getByText("3")).toBeInTheDocument();
});
