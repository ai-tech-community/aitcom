import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const reviewMutate = vi.fn();
const confirm = vi.fn();
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => confirm }));
const getPostReports = vi.fn<(input: unknown, opts: unknown) => unknown>();
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getActivity: { invalidate: vi.fn() },
        getFeed: { invalidate: vi.fn() },
        getReels: { invalidate: vi.fn() },
      },
    }),
    feed: {
      reviewReport: {
        useMutation: () => ({ mutate: reviewMutate, isPending: false }),
      },
      getPostReports: {
        useQuery: (input: unknown, opts: { enabled?: boolean }) =>
          getPostReports(input, opts),
      },
    },
  },
}));

import { ReportedBanner } from "./reported-banner";

function renderBanner(canReview: boolean) {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-09-24T12:00:00Z")}
      timeZone="UTC"
    >
      <ReportedBanner postId={9} canReview={canReview} />
    </NextIntlClientProvider>,
  );
}

describe("ReportedBanner", () => {
  beforeEach(() => {
    reviewMutate.mockClear();
    confirm.mockReset();
    getPostReports.mockReset();
  });

  it("shows moderators the reasons and notes, with Restore and Remove", async () => {
    confirm.mockResolvedValue(true);
    getPostReports.mockReturnValue({
      data: [
        {
          reason: "copyright",
          note: "This is my clip",
          createdAt: "2026-09-24T10:00:00Z",
        },
        { reason: "spam", note: null, createdAt: "2026-09-24T11:00:00Z" },
      ],
    });
    renderBanner(true);
    expect(getPostReports).toHaveBeenCalledWith(
      { postId: 9 },
      expect.objectContaining({ enabled: true }),
    );
    expect(
      screen.getByText("Reported and hidden from members."),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Why members reported it" });
    expect(list).toHaveTextContent("Copyright");
    expect(list).toHaveTextContent("This is my clip");
    expect(list).toHaveTextContent("Spam");
    expect(list).toHaveTextContent("2 hours ago");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(reviewMutate).toHaveBeenCalledWith({ postId: 9, action: "restore" });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(reviewMutate).toHaveBeenCalledWith({
        postId: 9,
        action: "remove",
      }),
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true }),
    );
  });

  it("does not remove the post when the moderator cancels", async () => {
    confirm.mockResolvedValue(false);
    getPostReports.mockReturnValue({ data: [] });
    renderBanner(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(reviewMutate).not.toHaveBeenCalled();
  });

  it("keeps the banner intact while the reasons load or fail", () => {
    getPostReports.mockReturnValue({ data: undefined, isError: true });
    renderBanner(true);
    expect(
      screen.getByText("Reported and hidden from members."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("gives the author a note only and never asks for the reasons", () => {
    getPostReports.mockReturnValue({ data: undefined });
    renderBanner(false);
    expect(
      screen.getByText("Hidden while a moderator reviews a report."),
    ).toBeInTheDocument();
    expect(getPostReports).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: true }),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
