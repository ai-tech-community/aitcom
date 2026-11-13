import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { GalleryReportDialog } from "./gallery-report-dialog";

type Failure = { message: string; data?: { code: string } };

const m = vi.hoisted(() => ({
  calls: [] as unknown[],
  fails: null as null | { message: string; data?: { code: string } },
  pending: false,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    gallery: {
      reportItem: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (error: unknown) => void;
        }) => ({
          isPending: m.pending,
          mutate: (input: unknown) => {
            m.calls.push(input);
            if (m.fails) opts.onError?.(m.fails);
            else opts.onSuccess?.();
          },
        }),
      },
    },
  },
}));

const onReported = vi.fn();

function Harness({ mediaType = "photo" }: { mediaType?: "photo" | "video" }) {
  const [open, setOpen] = useState(true);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <GalleryReportDialog
        slug="mlops"
        item={{ id: 7, mediaType }}
        open={open}
        onOpenChange={setOpen}
        onReported={onReported}
      />
    </NextIntlClientProvider>
  );
}

function fail(failure: Failure) {
  m.fails = failure;
}

describe("GalleryReportDialog", () => {
  beforeEach(() => {
    m.calls = [];
    m.fails = null;
    m.pending = false;
    onReported.mockClear();
  });

  it("names what is reported", () => {
    render(<Harness mediaType="video" />);
    expect(
      screen.getByRole("dialog", { name: "Report this video" }),
    ).toBeVisible();
  });

  it("lists “This is me” first, then the feed's reasons, none chosen", () => {
    render(<Harness />);
    const radios = within(
      screen.getByRole("group", { name: "What's wrong?" }),
    ).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "this_is_me",
      "spam",
      "inappropriate",
      "copyright",
      "other",
    ]);
    expect(
      radios.map((radio) => radio.parentElement?.textContent?.trim()),
    ).toEqual([
      "This is me, please remove it",
      "Spam",
      "Inappropriate",
      "Copyright",
      "Something else",
    ]);
    expect(radios.some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
  });

  it("sends the item, the reason and the note", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("radio", { name: "This is me, please remove it" }),
    );
    const note = screen.getByLabelText("Anything to add? (optional)");
    expect(note).toHaveAttribute("maxlength", "500");
    fireEvent.change(note, { target: { value: " I'm on the left " } });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(m.calls).toEqual([
      {
        slug: "mlops",
        itemId: 7,
        reason: "this_is_me",
        note: "I'm on the left",
      },
    ]);
  });

  it("says thanks in a status line, then tells the caller once it closes", async () => {
    render(<Harness />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(status).toHaveTextContent(
      "Thanks. It's hidden while a moderator reviews it.",
    );
    expect(screen.queryByRole("button", { name: "Send report" })).toBeNull();
    const done = screen.getByRole("button", { name: "Done" });
    await waitFor(() => expect(done).toHaveFocus());
    expect(onReported).not.toHaveBeenCalled();
    fireEvent.click(done);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onReported).toHaveBeenCalledTimes(1);
  });

  it("tells the caller nothing when closed without a report", async () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onReported).not.toHaveBeenCalled();
  });

  it("says so when this person already reported it", () => {
    fail({ message: "ALREADY_REPORTED", data: { code: "CONFLICT" } });
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You already reported this.",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(
      screen.getByRole("button", { name: "Send report" }),
    ).toBeInTheDocument();
  });

  it("explains other failures in words, never the raw message", () => {
    fail({ message: "connect ECONNREFUSED 10.0.0.1:5432" });
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't send your report. Please try again.",
    );
  });

  it("holds the send while a report is on its way", () => {
    m.pending = true;
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    expect(screen.getByRole("button", { name: "Send report" })).toBeDisabled();
  });
});
