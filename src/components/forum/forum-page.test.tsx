import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseQuery } = vi.hoisted(() => ({ mockUseQuery: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: { forum: { getThreads: { useQuery: mockUseQuery } } },
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/components/auth/session-provider", () => ({
  useInitialAuthUser: () => null,
  usePageDocumentAuthUser: () => null,
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ promptAuth: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { ForumPage } from "./forum-page";

function queryFailing(code: string) {
  mockUseQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
    error: { data: { code } },
    refetch: vi.fn(),
  });
}

describe("ForumPage", () => {
  beforeEach(() => mockUseQuery.mockReset());

  it("shows a members-only note when the community forum is not readable", () => {
    queryFailing("NOT_FOUND");
    render(<ForumPage communitySlug="secret-guild" />);
    expect(screen.getByText("membersOnlyTitle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("keeps the retryable error for other failures", () => {
    queryFailing("INTERNAL_SERVER_ERROR");
    render(<ForumPage communitySlug="secret-guild" />);
    expect(screen.queryByText("membersOnlyTitle")).toBeNull();
  });

  it("does not retry a NOT_FOUND answer but retries other errors", () => {
    queryFailing("NOT_FOUND");
    render(<ForumPage communitySlug="secret-guild" />);
    const retry = mockUseQuery.mock.calls[0]![1].retry as (
      n: number,
      err: { data?: { code?: string } },
    ) => boolean;
    expect(retry(0, { data: { code: "NOT_FOUND" } })).toBe(false);
    expect(retry(0, { data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(true);
    expect(retry(3, { data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(false);
  });
});
