import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSuggestions } from "./agent-suggestions";

const { mockUseQuery, mockUseUtils, mockUseMutation } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseUtils: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    agentManagement: {
      getSuggestions: {
        useQuery: mockUseQuery,
      },
      dismissSuggestion: {
        useMutation: mockUseMutation,
      },
      approveIntroduction: {
        useMutation: mockUseMutation,
      },
    },
    useUtils: mockUseUtils,
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      "suggestions.empty": "No suggestions",
      "suggestions.createThread": "Create thread",
      "suggestions.dismiss": "Dismiss",
    };
    return messages[key] ?? key;
  },
}));

describe("AgentSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUtils.mockReturnValue({
      agentManagement: {
        getSuggestions: {
          invalidate: vi.fn(),
        },
      },
    });
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("routes topic suggestions to the forum composer", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      data: [
        {
          id: "s1",
          type: "topic",
          title: "Draft an answerable thread",
          content: "Turn this into a thread starter.",
        },
      ],
    });

    render(<AgentSuggestions />);

    expect(
      screen.getByRole("link", { name: /create thread/i }),
    ).toHaveAttribute("href", "/forum/new");
  });
});
