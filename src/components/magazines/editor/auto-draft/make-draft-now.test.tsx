import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/components/magazines/test-intl";
import type { RouterOutputs } from "@/trpc/react";

type Outcome = RouterOutputs["magazines"]["makeAutoDraftNow"];
const trpc = vi.hoisted(() => ({
  outcome: { status: "busy" } as Outcome,
  error: false,
  pending: false,
  calls: [] as unknown[],
  invalidate: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      magazines: {
        autoDraftHistory: { invalidate: trpc.invalidate },
        listIssues: { invalidate: trpc.invalidate },
      },
    }),
    magazines: {
      makeAutoDraftNow: {
        useMutation: (opts: {
          onSuccess: (data: Outcome) => void;
          onError: (error: unknown) => void;
        }) => ({
          isPending: trpc.pending,
          mutate: (input: unknown) => {
            trpc.calls.push(input);
            if (trpc.error) opts.onError({ message: "RAW_ERROR" });
            else opts.onSuccess(trpc.outcome);
          },
        }),
      },
    },
  },
}));
import { MakeDraftNow } from "./make-draft-now";
beforeEach(() => {
  trpc.calls = [];
  trpc.error = false;
  trpc.pending = false;
  vi.clearAllMocks();
});
describe("MakeDraftNow", () => {
  it.each<[Outcome, string]>([
    [
      { status: "made", issueId: 42, itemCount: 4, goesOutAt: null },
      "Your draft is ready.",
    ],
    [
      {
        status: "skipped",
        reason: "too_few",
        found: 2,
        needed: 3,
        openIssueId: null,
      },
      "There is not enough yet: we found 2 things and a draft needs 3.",
    ],
    [
      {
        status: "skipped",
        reason: "draft_open",
        found: null,
        needed: null,
        openIssueId: 42,
      },
      "There is already an open draft. Finish or delete it first.",
    ],
    [
      {
        status: "skipped",
        reason: "no_rights",
        found: null,
        needed: null,
        openIssueId: null,
      },
      "You cannot make drafts for this magazine.",
    ],
    [
      { status: "busy" },
      "A draft is being made right now. Try again in a minute.",
    ],
    [
      { status: "already_ran" },
      "A draft is being made right now. Try again in a minute.",
    ],
  ])("announces %j", (outcome, message) => {
    trpc.outcome = outcome;
    renderWithIntl(<MakeDraftNow slug="night-owls" />);
    const button = screen.getByRole("button", { name: "Make a draft now" });
    expect(button).toHaveAttribute("data-variant", "ink");
    fireEvent.click(button);
    expect(trpc.calls).toEqual([{ slug: "night-owls" }]);
    expect(screen.getByRole("status")).toHaveTextContent(message);
    if (
      outcome.status === "made" ||
      (outcome.status === "skipped" && outcome.reason === "draft_open")
    )
      expect(
        screen.getByRole("link", { name: "Open the draft" }),
      ).toHaveAttribute(
        "href",
        "/communities/night-owls/magazine/issues/42/edit",
      );
    else expect(screen.queryByRole("link")).toBeNull();
    expect(trpc.invalidate).toHaveBeenCalledWith({ slug: "night-owls" });
  });
  it("maps unexpected errors and prevents another press while waiting", () => {
    trpc.error = true;
    const { unmount } = renderWithIntl(<MakeDraftNow slug="night-owls" />);
    fireEvent.click(screen.getByRole("button", { name: "Make a draft now" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
    unmount();
    trpc.pending = true;
    renderWithIntl(<MakeDraftNow slug="night-owls" />);
    expect(
      screen.getByRole("button", { name: "Make a draft now" }),
    ).toBeDisabled();
  });
});
