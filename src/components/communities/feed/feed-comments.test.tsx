import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import {
  openMemberCard,
  PRIVATE_MEMBER_CARD,
} from "@/test/member-card-fixture";

const m = vi.hoisted(() => ({
  comments: [] as unknown[],
  options: {} as Record<string, { onSuccess?: () => void }>,
  invalidate: {
    getComments: vi.fn(),
    getFeed: vi.fn(),
    getActivity: vi.fn(),
    getHomeActivity: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/trpc/react", () => {
  const capturing = (name: string) => (options: { onSuccess?: () => void }) => {
    m.options[name] = options;
    return { mutate: vi.fn(), isPending: false };
  };
  return {
    api: {
      useUtils: () => ({
        feed: Object.fromEntries(
          Object.entries(m.invalidate).map(([name, invalidate]) => [
            name,
            { invalidate },
          ]),
        ),
      }),
      feed: {
        getComments: {
          useQuery: () => ({
            data: m.comments,
            isLoading: false,
            isError: false,
            refetch: vi.fn(),
          }),
        },
        addComment: { useMutation: capturing("addComment") },
        editComment: { useMutation: capturing("editComment") },
        deleteComment: { useMutation: capturing("deleteComment") },
      },
    },
  };
});

import { FeedComments } from "./feed-comments";

describe("FeedComments", () => {
  it.each(["addComment", "deleteComment"])(
    "refreshes every list showing the comment count after %s",
    (name) => {
      render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <FeedComments postId={7} communitySlug="town" currentUserId="u1" />
        </NextIntlClientProvider>,
      );
      for (const fn of Object.values(m.invalidate)) fn.mockClear();

      m.options[name]!.onSuccess!();

      expect(m.invalidate.getComments).toHaveBeenCalledWith({ postId: 7 });
      expect(m.invalidate.getFeed).toHaveBeenCalledWith({
        communitySlug: "town",
      });
      expect(m.invalidate.getActivity).toHaveBeenCalledWith({
        communitySlug: "town",
      });
      expect(m.invalidate.getHomeActivity).toHaveBeenCalled();
    },
  );

  it("links a commenter's name to their profile, and never a private one", async () => {
    const comment = (id: number, authorId: string, authorName: string) => ({
      id,
      content: "Nice",
      authorId,
      authorName,
      authorImage: null,
      communityId: "c1",
      createdAt: "2026-11-10T10:00:00Z",
    });
    m.comments = [
      { ...comment(1, "u-naomi", "Naomi"), authorCard: openMemberCard() },
      { ...comment(2, "u-sam", "Sam"), authorCard: PRIVATE_MEMBER_CARD },
    ];
    try {
      render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <FeedComments postId={7} communitySlug="town" currentUserId="u1" />
        </NextIntlClientProvider>,
      );
      const naomi = screen.getByRole("link", { name: "Naomi" });
      expect(naomi).toHaveAttribute("href", "/members/u-naomi");
      expect(screen.queryByRole("link", { name: "Sam" })).toBeNull();
      fireEvent.pointerEnter(naomi);
      expect(await screen.findByText("@ Acme")).toBeInTheDocument();
    } finally {
      m.comments = [];
    }
  });
});
