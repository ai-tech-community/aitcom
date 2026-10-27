import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { REVIEW_NOTE_MAX } from "@/lib/magazines/review";

import en from "../../../../../messages/en.json";
import { renderWithIntl } from "../../test-intl";

type MutationOptions = {
  onSuccess: (data: {
    reviewStatus: "approved" | "changes_requested" | "rejected";
  }) => void;
  onError: (error: unknown) => void;
};

const trpc = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  outcome: { reviewStatus: "approved" } as
    | { reviewStatus: "approved" | "changes_requested" | "rejected" }
    | { message: string }
    | null,
  isPending: false,
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: trpc.push, refresh: trpc.refresh }),
}));
vi.mock("sonner", () => ({ toast: { success: trpc.toast } }));
vi.mock("@/trpc/react", () => ({
  api: {
    magazines: {
      reviewArticle: {
        useMutation: (opts: MutationOptions) => ({
          isPending: trpc.isPending,
          mutate: (input: Record<string, unknown>) => {
            trpc.calls.push(input);
            const outcome = trpc.outcome;
            if (!outcome) return;
            if ("reviewStatus" in outcome) opts.onSuccess(outcome);
            else opts.onError(outcome);
          },
        }),
      },
    },
  },
}));

import { ReviewActions } from "./review-actions";

const view = () => (
  <ReviewActions
    communitySlug="night-owls"
    articleId={7}
    articleTitle="Why evals matter"
  />
);

beforeEach(() => {
  trpc.calls = [];
  trpc.outcome = { reviewStatus: "approved" };
  trpc.isPending = false;
  trpc.push.mockReset();
  trpc.refresh.mockReset();
  trpc.toast.mockReset();
});

function expectSuccess(message: string) {
  expect(trpc.toast).toHaveBeenCalledWith(message);
  expect(trpc.push).toHaveBeenCalledWith("/communities/night-owls/magazine");
  expect(trpc.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status")).toHaveTextContent(message);
  expect(screen.getByRole("region", { name: "Your decision" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

describe("ReviewActions", () => {
  it("approves with one click", () => {
    renderWithIntl(view());
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(trpc.calls).toEqual([
      { slug: "night-owls", articleId: 7, decision: "approve" },
    ]);
    expectSuccess("Approved. It is ready for an issue.");
  });

  it("asking for changes needs a note", () => {
    trpc.outcome = { reviewStatus: "changes_requested" };
    renderWithIntl(view());
    const ask = screen.getByRole("button", { name: "Ask for changes" });
    expect(ask).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(ask);
    expect(ask).toHaveAttribute("aria-expanded", "true");
    const note = screen.getByRole("textbox", { name: "What should change?" });
    expect(note).toHaveFocus();
    expect(note).toBeRequired();
    expect(note).toHaveAttribute("maxlength", String(REVIEW_NOTE_MAX));
    expect(
      document.getElementById(ask.getAttribute("aria-controls")!),
    ).toContainElement(note);
    const send = screen.getByRole("button", { name: "Send to the writer" });
    expect(send).toBeDisabled();
    fireEvent.change(note, { target: { value: "   " } });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(trpc.calls).toEqual([]);
    fireEvent.change(note, { target: { value: "  Add a source  " } });
    expect(screen.getByText(`16 / ${REVIEW_NOTE_MAX}`)).toHaveClass(
      "font-mono",
    );
    fireEvent.click(send);
    expect(trpc.calls).toEqual([
      {
        slug: "night-owls",
        articleId: 7,
        decision: "request_changes",
        note: "Add a source",
      },
    ]);
    expectSuccess("Sent to the writer.");
  });

  it("declines only after confirming, with the optional note", () => {
    trpc.outcome = { reviewStatus: "rejected" };
    renderWithIntl(view());
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(trpc.calls).toEqual([]);
    const dialog = screen.getByRole("alertdialog", {
      name: "Decline this article?",
    });
    expect(dialog).toHaveTextContent(
      "The writer gets your note. They cannot send this article again.",
    );
    const note = within(dialog).getByRole("textbox", {
      name: "Note for the writer (optional)",
    });
    expect(note).not.toBeRequired();
    expect(note).toHaveAttribute("maxlength", String(REVIEW_NOTE_MAX));
    fireEvent.change(note, {
      target: { value: "  Outside this issue's topic  " },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Decline article" }),
    );
    expect(trpc.calls).toEqual([
      {
        slug: "night-owls",
        articleId: 7,
        decision: "reject",
        note: "Outside this issue's topic",
      },
    ]);
    expectSuccess("Article declined.");
  });

  it("can decline without a note and can cancel without deciding", () => {
    trpc.outcome = { reviewStatus: "rejected" };
    renderWithIntl(view());
    const decline = screen.getByRole("button", {
      name: "Decline",
    });
    fireEvent.click(decline);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trpc.calls).toEqual([]);
    fireEvent.click(decline);
    fireEvent.click(screen.getByRole("button", { name: "Decline article" }));
    expect(trpc.calls).toEqual([
      { slug: "night-owls", articleId: 7, decision: "reject" },
    ]);
  });

  it("shows the friendly message when someone else decided first", () => {
    trpc.outcome = { message: "ARTICLE_NOT_PENDING" };
    renderWithIntl(view());
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(trpc.calls).toEqual([
      { slug: "night-owls", articleId: 7, decision: "approve" },
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      en.magazineEditor.errors.articleNotPending,
    );
    expect(screen.queryByText("ARTICLE_NOT_PENDING")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(trpc.refresh).toHaveBeenCalledTimes(1);
    expect(trpc.push).not.toHaveBeenCalled();
    expect(trpc.toast).not.toHaveBeenCalled();
  });

  it("keeps a decline error inside the dialog", () => {
    trpc.outcome = { message: "ARTICLE_NOT_PENDING" };
    renderWithIntl(view());
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Decline article" }));
    expect(trpc.calls).toEqual([
      { slug: "night-owls", articleId: 7, decision: "reject" },
    ]);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      en.magazineEditor.errors.articleNotPending,
    );
    expect(
      within(dialog).getByRole("button", { name: "Reload" }),
    ).toBeEnabled();
  });

  it("prevents another decision while one is in flight", () => {
    trpc.outcome = null;
    renderWithIntl(view());
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(trpc.calls).toEqual([
      { slug: "night-owls", articleId: 7, decision: "approve" },
    ]);
  });

  it("disables the decision controls while the mutation is pending", () => {
    trpc.isPending = true;
    renderWithIntl(view());
    for (const button of screen.getAllByRole("button"))
      expect(button).toBeDisabled();
  });

  it("every control has a label", () => {
    renderWithIntl(view());
    expect(screen.getByRole("region", { name: "Your decision" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toHaveAttribute(
      "data-variant",
      "default",
    );
    const ask = screen.getByRole("button", { name: "Ask for changes" });
    expect(ask).toHaveAttribute("data-variant", "outline");
    const decline = screen.getByRole("button", {
      name: "Decline",
    });
    expect(decline).toHaveAttribute("data-variant", "ghost");
    fireEvent.click(ask);
    expect(
      screen.getByRole("textbox", { name: "What should change?" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Send to the writer" }),
    ).toHaveAttribute("data-variant", "ink");
    fireEvent.click(decline);
    expect(
      screen.getByRole("textbox", { name: "Note for the writer (optional)" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Decline article" }),
    ).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByRole("button", { name: "Decline article" })).toHaveClass(
      "bg-destructive",
    );
    expect(
      screen.getByRole("button", { name: "Decline article" }),
    ).not.toHaveClass("bg-primary");
  });
});
