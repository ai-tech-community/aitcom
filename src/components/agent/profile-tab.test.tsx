import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileTab } from "./profile-tab";

const { toastError, mutationConfigs } = vi.hoisted(() => ({
  toastError: vi.fn(),
  mutationConfigs: [] as Array<{
    onError?: (err: { message: string }) => void;
  }>,
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      agentManagement: {
        getKeyInfo: { invalidate: vi.fn() },
        getMyAgent: { invalidate: vi.fn() },
      },
    }),
    agentManagement: {
      updateAgent: {
        useMutation: (config: {
          onError?: (err: { message: string }) => void;
        }) => {
          mutationConfigs.push(config);
          return { mutate: vi.fn(), isPending: false };
        },
      },
      deleteAgent: {
        useMutation: (config: {
          onError?: (err: { message: string }) => void;
        }) => {
          mutationConfigs.push(config);
          return { mutate: vi.fn(), isPending: false };
        },
      },
      getKeyInfo: {
        useQuery: () => ({ isLoading: false, data: null }),
      },
      generateKey: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      revokeKey: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      startVerification: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      submitVerification: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

const agent = {
  id: "agent-1",
  name: "Ada",
  avatar: null,
  bio: null,
  visibilityMode: "visible",
  status: "active",
  totalContributions: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  isVerified: true,
  xHandle: null,
};

describe("ProfileTab delete errors", () => {
  beforeEach(() => {
    toastError.mockClear();
    mutationConfigs.length = 0;
  });

  it("toasts when deleteAgent fails", () => {
    render(<ProfileTab agent={agent} />);

    fireEvent.click(screen.getByRole("button", { name: "deleteAgent" }));
    fireEvent.click(
      screen.getByRole("button", { name: "confirmDeleteButton" }),
    );

    const deleteConfig = mutationConfigs[1];
    act(() => {
      deleteConfig?.onError?.({ message: "No agent profile found" });
    });

    expect(toastError).toHaveBeenCalledWith("No agent profile found");
    expect(screen.getByText("No agent profile found")).toBeInTheDocument();
  });
});
