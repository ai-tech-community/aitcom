import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { ConfirmProvider } from "@/components/confirm-dialog";
import { GalleryReviewBanner } from "./gallery-review-banner";

type Report = {
  id: number;
  reason: string;
  note: string | null;
  createdAt: string;
};

const m = vi.hoisted(() => ({
  reportInputs: [] as unknown[],
  reportOptions: [] as unknown[],
  reports: undefined as undefined | { reports: Report[] },
  reportsError: null as null | { message: string },
  refetch: vi.fn(),
  fetching: false,
  invalidateReports: vi.fn(),
  reviewCalls: [] as unknown[],
  reviewFails: null as null | { message: string; data?: { code: string } },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: { itemReports: { invalidate: m.invalidateReports } },
    }),
    gallery: {
      itemReports: {
        useQuery: (input: unknown, options: { enabled: boolean }) => {
          m.reportInputs.push(input);
          m.reportOptions.push(options);
          return {
            data: options.enabled ? m.reports : undefined,
            isError: options.enabled && m.reportsError !== null,
            error: m.reportsError,
            isFetching: options.enabled && m.fetching,
            refetch: m.refetch,
          };
        },
      },
      reviewItemReports: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, input: unknown) => void;
          onError?: (error: unknown, input: unknown) => void;
        }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            m.reviewCalls.push(input);
            if (m.reviewFails) opts.onError?.(m.reviewFails, input);
            else opts.onSuccess?.(undefined, input);
          },
        }),
      },
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: m.toastSuccess, error: m.toastError },
}));

const REPORTS: Report[] = [
  {
    id: 41,
    reason: "this_is_me",
    note: "I'm on the left",
    createdAt: "2026-11-13T09:00:00.000Z",
  },
  { id: 40, reason: "spam", note: null, createdAt: "2026-11-12T09:00:00.000Z" },
];

const onRestored = vi.fn();
const onRemoved = vi.fn();

function renderBanner({
  canReview,
  mediaType = "photo",
}: {
  canReview: boolean;
  mediaType?: "photo" | "video";
}) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ConfirmProvider>
        <GalleryReviewBanner
          slug="mlops"
          item={{ id: 7, mediaType }}
          canReview={canReview}
          onRestored={onRestored}
          onRemoved={onRemoved}
        />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

describe("GalleryReviewBanner", () => {
  beforeEach(() => {
    m.reportInputs = [];
    m.reportOptions = [];
    m.reports = { reports: REPORTS };
    m.reportsError = null;
    m.reviewCalls = [];
    m.reviewFails = null;
    m.refetch.mockClear();
    m.fetching = false;
    m.invalidateReports.mockClear();
    m.toastSuccess.mockClear();
    m.toastError.mockClear();
    onRestored.mockClear();
    onRemoved.mockClear();
  });

  describe("for the uploader", () => {
    it("says the item is hidden while a moderator looks, and offers nothing", () => {
      renderBanner({ canReview: false });
      expect(
        screen.getByText("Hidden while a moderator reviews it."),
      ).toBeVisible();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("list")).toBeNull();
      // Never asks for the reports: only moderators may read them.
      expect(m.reportOptions).toEqual(
        m.reportOptions.map(() => ({ enabled: false })),
      );
    });
  });

  describe("for a moderator", () => {
    it("lists why it was reported, with the notes", () => {
      renderBanner({ canReview: true });
      expect(screen.getByText("Hidden after a report")).toBeVisible();
      expect(m.reportInputs.at(-1)).toEqual({ slug: "mlops", itemId: 7 });
      const list = screen.getByRole("list", { name: "Why it was reported" });
      const rows = within(list).getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent("This is me, please remove it");
      expect(rows[0]).toHaveTextContent("I'm on the left");
      expect(rows[1]).toHaveTextContent("Spam");
      const time = rows[0]!.querySelector("time")!;
      expect(time).toHaveClass("font-mono");
      expect(time).not.toHaveClass("text-muted-foreground");
    });

    it("restores with exactly the reports it showed", () => {
      renderBanner({ canReview: true });
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      expect(m.reviewCalls).toEqual([
        {
          slug: "mlops",
          itemId: 7,
          action: "restore",
          reviewedReportIds: [41, 40],
        },
      ]);
      expect(onRestored).toHaveBeenCalledTimes(1);
      expect(onRemoved).not.toHaveBeenCalled();
      expect(m.toastSuccess).toHaveBeenCalledWith("Restored");
      // A report that came in meanwhile hid it again: show it next.
      expect(m.invalidateReports).toHaveBeenCalledWith({
        slug: "mlops",
        itemId: 7,
      });
    });

    it("can't restore while the reports are being read again", () => {
      m.fetching = true;
      renderBanner({ canReview: true });
      expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
    });

    it("can't restore before it has shown the reports", () => {
      m.reports = undefined;
      renderBanner({ canReview: true });
      const restore = screen.getByRole("button", { name: "Restore" });
      expect(restore).toBeDisabled();
      fireEvent.click(restore);
      expect(m.reviewCalls).toEqual([]);
    });

    it("can't restore when there is no open report to decide on", () => {
      m.reports = { reports: [] };
      renderBanner({ canReview: true });
      const none = screen.getByText("No open reports.");
      expect(none).toBeVisible();
      // Muted text drops under 4.5:1 on the warning tint.
      expect(none).not.toHaveClass("text-muted-foreground");
      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    });

    it("says when the reports didn't load, and tries again on request", () => {
      m.reports = undefined;
      m.reportsError = { message: "boom" };
      renderBanner({ canReview: true });
      expect(
        screen.getByText("We couldn't load why it was reported."),
      ).toBeVisible();
      expect(screen.queryByText("boom")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(m.refetch).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
    });

    it("removes only after the confirmation", async () => {
      renderBanner({ canReview: true, mediaType: "video" });
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      const confirm = screen.getByRole("alertdialog", {
        name: "Remove this video?",
      });
      expect(m.reviewCalls).toEqual([]);
      fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
      await waitFor(() =>
        expect(m.reviewCalls).toEqual([
          { slug: "mlops", itemId: 7, action: "remove" },
        ]),
      );
      expect(onRemoved).toHaveBeenCalledTimes(1);
      expect(onRestored).not.toHaveBeenCalled();
      expect(m.toastSuccess).toHaveBeenCalledWith("Removed");
    });

    it("does nothing when the removal is cancelled", async () => {
      renderBanner({ canReview: true });
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      fireEvent.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Cancel",
        }),
      );
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(m.reviewCalls).toEqual([]);
      expect(onRemoved).not.toHaveBeenCalled();
    });

    it("explains a failed review in words", () => {
      m.reviewFails = { message: "connect ECONNREFUSED" };
      renderBanner({ canReview: true });
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      expect(m.toastError).toHaveBeenCalledWith(
        "We couldn't finish the review. Please try again.",
      );
      expect(onRestored).not.toHaveBeenCalled();
    });

    it("explains a refused review with the server's code", () => {
      m.reviewFails = { message: "NOT_ALLOWED", data: { code: "FORBIDDEN" } };
      renderBanner({ canReview: true });
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
      expect(m.toastError).toHaveBeenCalledWith(
        "You can't change this photo or video.",
      );
    });
  });
});
