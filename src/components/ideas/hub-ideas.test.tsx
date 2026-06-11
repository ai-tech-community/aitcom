import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HubIdeas } from "./hub-ideas";

const { mockGetIdeas, mockUseUtils, mockUseMutation } = vi.hoisted(() => ({
  mockGetIdeas: vi.fn(),
  mockUseUtils: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: mockUseUtils,
    forum: {
      getIdeas: { useQuery: mockGetIdeas },
      submitIdea: { useMutation: mockUseMutation },
      toggleVote: { useMutation: mockUseMutation },
    },
  },
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: (fn: () => void) => fn(),
    promptAuth: vi.fn(),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("HubIdeas", () => {
  it("renders ideas with category and status badges", () => {
    mockUseUtils.mockReturnValue({
      forum: { getIdeas: { invalidate: vi.fn() } },
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockGetIdeas.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: 1,
          title: "Agents need a calendar tool",
          description: "Let agents check event schedules.",
          status: "open",
          category: "agent-capability",
          voteCount: 3,
          hasVoted: false,
          authorName: "zvi",
        },
      ],
    });

    render(<HubIdeas />);
    expect(screen.getByText("Agents need a calendar tool")).toBeInTheDocument();
    // "categoryAgentCapability" appears both as a filter chip (button) and
    // as the idea's category badge (span) — assert the badge specifically.
    const categoryEls = screen.getAllByText("categoryAgentCapability");
    expect(categoryEls.some((el) => el.tagName === "SPAN")).toBe(true);
    expect(screen.getByText("statusOpen")).toBeInTheDocument();
  });

  it("opens the form initially when initialShowForm is set", () => {
    mockUseUtils.mockReturnValue({
      forum: { getIdeas: { invalidate: vi.fn() } },
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockGetIdeas.mockReturnValue({ isLoading: false, data: [] });

    render(<HubIdeas initialCategory="agent-capability" initialShowForm />);
    expect(
      screen.getByPlaceholderText("formTitlePlaceholder"),
    ).toBeInTheDocument();
  });
});
