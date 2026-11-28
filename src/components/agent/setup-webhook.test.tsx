import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetupWebhook } from "./setup-webhook";

const { webhookQuery, createWebhook, approveWebhook } = vi.hoisted(() => ({
  webhookQuery: vi.fn(),
  createWebhook: vi.fn(),
  approveWebhook: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({ Link: "a" }));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => false,
}));

vi.mock("@/trpc/react", () => {
  const idleMutation = { useMutation: () => ({ isPending: false }) };
  return {
    api: {
      agentManagement: {
        getWebhook: { useQuery: webhookQuery },
        upsertWebhook: {
          useMutation: ({
            onSuccess,
          }: {
            onSuccess: (data: unknown) => void;
          }) => ({
            mutate: (input: unknown) => onSuccess(createWebhook(input)),
          }),
        },
        approveWebhook: {
          useMutation: ({
            onSuccess,
          }: {
            onSuccess: (data: unknown) => void;
          }) => ({
            mutate: () => onSuccess(approveWebhook()),
          }),
        },
        deleteWebhook: idleMutation,
        rejectWebhook: idleMutation,
        testWebhook: idleMutation,
      },
    },
  };
});

const activeWebhook = {
  url: "https://example.com/hook",
  categories: ["inbox"],
  hasSecret: true,
  status: "active",
  isEnabled: true,
  consecutiveFailures: 0,
};
const secretPrompt = /webhook secret — save this now/i;
const refetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  webhookQuery.mockReturnValue({ data: activeWebhook, refetch });
});

describe("SetupWebhook signing secret", () => {
  it("shows existing webhook configuration from metadata alone", () => {
    render(<SetupWebhook />);

    expect(screen.getByDisplayValue(activeWebhook.url)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(secretPrompt)).not.toBeInTheDocument();
  });

  it("shows the secret from the creation response", () => {
    webhookQuery.mockReturnValue({ data: null, refetch });
    createWebhook.mockReturnValue({
      secretGenerated: true,
      secret: "new-secret",
    });
    render(<SetupWebhook />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: activeWebhook.url },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /messages/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("new-secret")).toBeInTheDocument();
  });

  it("shows the secret after approval and hides it when reopened", () => {
    webhookQuery.mockReturnValue({
      data: { ...activeWebhook, status: "pending", isEnabled: false },
      refetch,
    });
    approveWebhook.mockReturnValue({ secret: "approved-secret" });
    const { unmount } = render(<SetupWebhook />);
    expect(screen.queryByText(secretPrompt)).not.toBeInTheDocument();

    refetch.mockImplementation(() =>
      webhookQuery.mockReturnValue({ data: activeWebhook, refetch }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(screen.getByText("approved-secret")).toBeInTheDocument();

    unmount();
    render(<SetupWebhook />);
    expect(screen.queryByText(secretPrompt)).not.toBeInTheDocument();
  });
});
