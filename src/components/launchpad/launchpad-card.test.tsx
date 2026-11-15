// A refused vote on a Launchpad project says what to do next: accept the
// project's own community rules (not the Hub's), or join the community. A
// signed-in member is never told to sign in.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

interface VoteOptions {
  onMutate?: (input: { projectId: number }) => Promise<unknown>;
  onError?: (
    error: { message: string; data?: { code?: string } },
    input: { projectId: number },
    ctx: unknown,
  ) => void;
}

const m = vi.hoisted(() => ({
  vote: {} as VoteOptions,
  mutate: vi.fn(),
  openRulesModal: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ requireAuth: (run: () => void) => run() }),
}));
vi.mock("@/components/community/rules-provider", () => ({
  useRulesModal: () => ({ openRulesModal: m.openRulesModal }),
}));
vi.mock("sonner", () => ({
  toast: { error: m.toastError, success: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      launchpad: {
        list: {
          cancel: vi.fn(),
          getData: vi.fn(),
          setData: vi.fn(),
          invalidate: vi.fn(),
        },
      },
    }),
    launchpad: {
      vote: {
        useMutation: (options: VoteOptions) => {
          m.vote = options;
          return { mutate: m.mutate, isPending: false };
        },
      },
    },
  },
}));

import { LaunchpadCard } from "./launchpad-card";

function renderCard(communitySlug: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LaunchpadCard
        index={0}
        project={{
          id: 7,
          title: "Robot arm",
          slug: "robot-arm",
          stage: "idea",
          hasVoted: false,
          voteCount: 3,
          createdAt: "2026-11-01T00:00:00.000Z",
          communitySlug,
        }}
      />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /3/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.vote = {};
});

describe("LaunchpadCard vote errors", () => {
  it("opens the rules prompt for the project's own community", () => {
    renderCard("makers");
    expect(m.mutate).toHaveBeenCalledWith({ projectId: 7 });
    m.vote.onError?.(
      { message: "RULES_NOT_ACCEPTED", data: { code: "PRECONDITION_FAILED" } },
      { projectId: 7 },
      undefined,
    );
    expect(m.openRulesModal).toHaveBeenCalledWith("makers");
    expect(m.toastError).not.toHaveBeenCalledWith("Sign in to vote");
  });

  it("tells a signed-in non-member to join, not to sign in", () => {
    renderCard("makers");
    m.vote.onError?.(
      {
        message: "Must be an active community member",
        data: { code: "FORBIDDEN" },
      },
      { projectId: 7 },
      undefined,
    );
    expect(m.toastError).toHaveBeenCalledWith(en.launchpad.vote.membersOnly);
    expect(m.openRulesModal).not.toHaveBeenCalled();
  });
});
