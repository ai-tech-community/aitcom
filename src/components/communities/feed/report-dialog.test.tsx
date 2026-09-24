import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const { mutate, invalidate } = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidate: {
    getActivity: vi.fn(),
    getFeed: vi.fn(),
    getReels: vi.fn(),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getActivity: { invalidate: invalidate.getActivity },
        getFeed: { invalidate: invalidate.getFeed },
        getReels: { invalidate: invalidate.getReels },
      },
    }),
    feed: {
      reportPost: { useMutation: () => ({ mutate, isPending: false }) },
    },
  },
}));

import { ReportDialog } from "./report-dialog";

function renderDialog() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReportDialog postId={5} open onOpenChange={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("ReportDialog", () => {
  beforeEach(() => mutate.mockClear());

  it("sends the chosen reason and note", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: "Copyright" }));
    fireEvent.change(screen.getByLabelText("Anything to add? (optional)"), {
      target: { value: "My clip" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(mutate).toHaveBeenCalledWith(
      { postId: 5, reason: "copyright", note: "My clip" },
      expect.anything(),
    );
  });

  it("leaves the note out when it is blank", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Anything to add? (optional)"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(mutate).toHaveBeenCalledWith(
      { postId: 5, reason: "spam" },
      expect.anything(),
    );
  });

  it("refreshes the feed, activity, and reels after a report", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    const [, callbacks] = mutate.mock.calls[0]! as [
      unknown,
      { onSuccess: () => void },
    ];
    callbacks.onSuccess();
    expect(invalidate.getActivity).toHaveBeenCalled();
    expect(invalidate.getFeed).toHaveBeenCalled();
    expect(invalidate.getReels).toHaveBeenCalled();
  });
});
