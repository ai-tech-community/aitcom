import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  options: {} as Record<string, { onSuccess?: () => void }>,
  invalidate: {
    getComments: vi.fn(),
    getFeed: vi.fn(),
    getActivity: vi.fn(),
    getHomeActivity: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
            data: [],
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
});
