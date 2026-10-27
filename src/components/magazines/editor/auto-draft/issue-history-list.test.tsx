import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueHistoryEntry } from "@/components/magazines/test-fixtures";
import { renderWithIntl } from "@/components/magazines/test-intl";
import type {
  IssueHistoryEntry,
  IssueHistoryDetail,
} from "@/lib/magazines/issue-history";
const trpc = vi.hoisted(() => ({
  data: [] as IssueHistoryEntry[],
  loading: false,
  error: false,
  refetch: vi.fn(),
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
    magazines: {
      autoDraftHistory: {
        useQuery: () => ({
          data: trpc.data,
          isLoading: trpc.loading,
          isError: trpc.error,
          refetch: trpc.refetch,
        }),
      },
    },
  },
}));
import { IssueHistoryList } from "./issue-history-list";
beforeEach(() => {
  trpc.data = [];
  trpc.loading = false;
  trpc.error = false;
  vi.clearAllMocks();
});
describe("IssueHistoryList", () => {
  it.each<[IssueHistoryDetail, string]>([
    [
      { event: "draft_made", trigger: "manual", itemCount: 4, goesOutAt: null },
      "made a draft",
    ],
    [
      {
        event: "draft_made",
        trigger: "schedule",
        itemCount: 4,
        goesOutAt: "2026-11-01T09:00:00Z",
      },
      "made a draft that goes out on",
    ],
    [
      {
        event: "draft_skipped",
        trigger: "schedule",
        reason: "too_few",
        found: 2,
        needed: 3,
      },
      "made no draft: there was not enough yet (found 2, a draft needs 3)",
    ],
    [
      {
        event: "draft_skipped",
        trigger: "schedule",
        reason: "draft_open",
        found: null,
        needed: null,
      },
      "made no draft: there is already an open draft",
    ],
    [
      {
        event: "draft_skipped",
        trigger: "schedule",
        reason: "no_rights",
        found: null,
        needed: null,
      },
      "made no draft: the person who set this up can no longer edit the magazine",
    ],
    [{ event: "items_changed", itemCount: 3 }, "changed the items"],
    [
      { event: "auto_publish_stopped", why: "stopped" },
      "stopped the automatic publish",
    ],
    [
      { event: "auto_publish_stopped", why: "edited" },
      "stopped the automatic publish by editing",
    ],
    [
      { event: "auto_publish_stopped", why: "failed", failure: "auto_off" },
      "could not publish it by itself: automatic publishing is switched off",
    ],
    [
      { event: "auto_publish_stopped", why: "failed", failure: "no_rights" },
      "could not publish it by itself: the person who set it up can no longer edit the magazine",
    ],
    [
      { event: "auto_publish_stopped", why: "failed", failure: "empty" },
      "could not publish it by itself: the issue is empty",
    ],
    [
      { event: "auto_publish_stopped", why: "failed", failure: "invalid_item" },
      "could not publish it by itself: an item cannot be published",
    ],
    [
      { event: "auto_publish_stopped", why: "failed", failure: "error" },
      "could not publish it by itself: something went wrong",
    ],
    [{ event: "published", origin: "button" }, "published it"],
    [{ event: "published", origin: "schedule" }, "published it on schedule"],
    [{ event: "published", origin: "auto" }, "published it automatically"],
    [{ event: "deleted" }, "deleted it"],
  ])("says who did what, automatic when nobody did: %j", (detail, text) => {
    trpc.data = [issueHistoryEntry(detail, { actorName: null })];
    const { unmount } = renderWithIntl(<IssueHistoryList slug="night-owls" />);
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent(`Automatic ${text}`);
    expect(row).toHaveTextContent("Issue 7: Community news");
    expect(row.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-27T12:00:00.000Z",
    );
    expect(row.querySelector("time")).toHaveClass("font-mono");
    unmount();
    trpc.data[0]!.actorName = "Ada";
    renderWithIntl(<IssueHistoryList slug="night-owls" />);
    expect(screen.getByRole("listitem")).toHaveTextContent(`Ada ${text}`);
  });
  it("links only issues that are still being worked on", () => {
    trpc.data = [
      issueHistoryEntry({ event: "items_changed", itemCount: 3 }),
      issueHistoryEntry(
        { event: "items_changed", itemCount: 3 },
        {
          id: 2,
          issue: {
            id: 43,
            number: 8,
            title: "Scheduled news",
            status: "scheduled",
          },
        },
      ),
      issueHistoryEntry(
        { event: "published", origin: "auto" },
        {
          id: 3,
          issue: {
            id: 44,
            number: 9,
            title: "Published news",
            status: "published",
          },
        },
      ),
      issueHistoryEntry(
        { event: "deleted" },
        {
          id: 4,
          issue: { id: null, number: 10, title: "Deleted news", status: null },
        },
      ),
    ];
    renderWithIntl(<IssueHistoryList slug="night-owls" />);
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/communities/night-owls/magazine/issues/42/edit",
      "/communities/night-owls/magazine/issues/43/edit",
    ]);
    expect(screen.getByText("Issue 9: Published news")).toBeVisible();
    expect(screen.getByText("Issue 10: Deleted news")).toBeVisible();
  });
  it("teaches what will appear when empty", () => {
    renderWithIntl(<IssueHistoryList slug="night-owls" />);
    expect(screen.getByRole("heading", { name: /History/ })).toBeVisible();
    expect(
      screen.getByText(
        "Nothing yet. When the magazine makes or skips a draft, you will see it here.",
      ),
    ).toBeVisible();
  });
  it("shows loading and allows retrying a failed load", () => {
    trpc.loading = true;
    const { unmount } = renderWithIntl(<IssueHistoryList slug="night-owls" />);
    expect(
      document.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    unmount();
    trpc.loading = false;
    trpc.error = true;
    renderWithIntl(<IssueHistoryList slug="night-owls" />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(trpc.refetch).toHaveBeenCalled();
  });
});
