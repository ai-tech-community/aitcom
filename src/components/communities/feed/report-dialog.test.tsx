import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const mutate = vi.fn();
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getActivity: { invalidate: vi.fn() },
        getFeed: { invalidate: vi.fn() },
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
});
