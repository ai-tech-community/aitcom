import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiKey } from "./agent-api-key";

const { toastError, generateConfig } = vi.hoisted(() => ({
  toastError: vi.fn(),
  generateConfig: {
    current: null as null | {
      onError?: (err: { message: string }) => void;
      onSuccess?: (data: { key: string; prefix: string }) => void;
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      agentManagement: {
        getKeyInfo: { invalidate: vi.fn() },
      },
    }),
    agentManagement: {
      getKeyInfo: {
        useQuery: () => ({
          isLoading: false,
          data: {
            prefix: "ait_sk_sample",
            scopes: ["read"],
            lastUsedAt: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        }),
      },
      generateKey: {
        useMutation: (config: {
          onError?: (err: { message: string }) => void;
        }) => {
          generateConfig.current = config;
          return { mutate: vi.fn(), isPending: false };
        },
      },
      revokeKey: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

describe("AgentApiKey regenerate errors", () => {
  beforeEach(() => {
    toastError.mockClear();
    generateConfig.current = null;
  });

  it("toasts when regenerate fails", () => {
    render(<AgentApiKey />);

    fireEvent.click(screen.getByRole("button", { name: "regenerateKey" }));
    fireEvent.click(screen.getByRole("button", { name: "YES, REGENERATE" }));

    generateConfig.current?.onError?.({
      message: "API key could not be rotated",
    });

    expect(toastError).toHaveBeenCalledWith("API key could not be rotated");
  });
});
