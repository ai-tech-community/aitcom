import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentApiKey } from "./agent-api-key";
import { BuilderKeyProvider } from "./builder/builder-key-controls";
import { RevealedKeyProvider } from "./agent/revealed-key-context";
import messages from "../../messages/en.json";

const {
  redesigned,
  confirm,
  generate,
  revoke,
  toastError,
  generateConfig,
  keyUsage,
} = vi.hoisted(() => ({
  redesigned: { value: false },
  confirm: vi.fn(),
  generate: vi.fn(),
  revoke: vi.fn(),
  toastError: vi.fn(),
  keyUsage: { lastUsedAt: null as Date | null },
  generateConfig: {
    current: null as null | {
      onError?: (err: { message: string }) => void;
      onSuccess?: (data: { key: string; prefix: string }) => void;
    },
  },
}));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => redesigned.value,
}));

vi.mock("@/components/confirm-dialog", () => ({
  useConfirm: () => confirm,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: "a",
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

vi.mock("next-intl", async (importOriginal) => {
  const { createTranslator } =
    await importOriginal<typeof import("next-intl")>();
  return {
    useTranslations:
      () =>
      (
        key: string,
        values?: {
          prefix: string;
          name: string;
          lastCall: string;
          callRecorded: string;
        },
      ) =>
        values?.prefix
          ? createTranslator({
              locale: "en",
              messages: messages.redesign.builder.key,
            })(key as "rotateConfirm" | "revokeConfirm", values)
          : key,
    useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
  };
});

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      agentManagement: {
        getKeyInfo: { invalidate: vi.fn() },
      },
    }),
    agentManagement: {
      getManifest: { useQuery: () => ({ data: { accepted: false } }) },
      getKeyInfo: {
        useQuery: () => ({
          isLoading: false,
          isSuccess: true,
          dataUpdatedAt: 1,
          data: {
            prefix: "ait_sk_sample",
            scopes: ["read", "contribute"],
            lastUsedAt: keyUsage.lastUsedAt,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        }),
      },
      generateKey: {
        useMutation: (config: {
          onError?: (err: { message: string }) => void;
        }) => {
          generateConfig.current = config;
          return { mutate: generate, reset: vi.fn(), isPending: false };
        },
      },
      revokeKey: {
        useMutation: () => ({
          mutate: revoke,
          reset: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

describe("legacy key controls", () => {
  beforeEach(() => {
    redesigned.value = false;
    keyUsage.lastUsedAt = null;
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

  it("keeps the legacy per-key usage display when the flag is off", () => {
    const lastUse = new Date("2026-01-02T00:00:00.000Z");
    keyUsage.lastUsedAt = lastUse;
    render(<AgentApiKey />);

    expect(
      screen.getByText(`Last used ${lastUse.toLocaleDateString()}`),
    ).toBeVisible();
  });
});

describe("redesigned key controls", () => {
  beforeEach(() => {
    redesigned.value = true;
    confirm.mockReset();
    generate.mockReset();
    revoke.mockReset();
    keyUsage.lastUsedAt = null;
  });

  it("asks before rotation and exposes the new key and Connect link after success", async () => {
    confirm.mockResolvedValue(true);
    render(
      <RevealedKeyProvider>
        <BuilderKeyProvider>
          <AgentApiKey />
        </BuilderKeyProvider>
      </RevealedKeyProvider>,
    );

    expect(screen.getByText("ait_sk_sample…")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "key.rotate" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Key ait_sk_sample… The old key stops working immediately when you rotate it. Update every connected client with the new key.",
        destructive: true,
      }),
    );
    await waitFor(() => expect(generate).toHaveBeenCalledOnce());

    act(() =>
      generateConfig.current?.onSuccess?.({
        key: "ait_sk_mock_new_key",
        prefix: "ait_sk_mock",
      }),
    );
    expect(screen.queryByText("ait_sk_mock_new_key")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "show" }));
    expect(screen.getByText("ait_sk_mock_new_key")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "hide" }));
    expect(screen.queryByText("ait_sk_mock_new_key")).toBeNull();
    expect(screen.getByRole("button", { name: "copyLabel" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "key.openConnect" }),
    ).toHaveAttribute("href", "/dashboard/agent?tab=connect");
  });

  it("keeps the active key when rotation is cancelled", async () => {
    confirm.mockResolvedValue(false);
    render(
      <RevealedKeyProvider>
        <BuilderKeyProvider>
          <AgentApiKey />
        </BuilderKeyProvider>
      </RevealedKeyProvider>,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "key.rotate" })),
    );
    expect(confirm).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByText("ait_sk_sample…")).toBeVisible();
  });
  it("displays the stored creation time and confirms revocation", async () => {
    const authCheck = "2026-01-02T00:00:00.000Z";
    keyUsage.lastUsedAt = new Date(authCheck);
    confirm.mockResolvedValue(true);
    render(
      <BuilderKeyProvider
        agent={{
          name: "Workbench agent",
          lastActiveAt: new Date("2026-01-03T00:00:00.000Z"),
        }}
      >
        <AgentApiKey />
      </BuilderKeyProvider>,
    );

    expect(screen.getByText("key.createdLabel")).toBeVisible();
    expect(screen.getByText("2026-01-01T00:00:00.000Z")).toBeVisible();
    expect(screen.queryByText(authCheck)).toBeNull();
    expect(screen.getByText("key.permissions.read")).toBeVisible();
    expect(screen.getByText("key.permissions.blocked")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "key.revoke" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          "Revoke key ait_sk_sample… for Workbench agent? Last agent call was 2026-01-03T00:00:00.000Z. This disconnects every client using this key. You’ll need a new key to reconnect them.",
        destructive: true,
      }),
    );
    await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
  });

  it("uses the agent call time for rotation and omits the key authentication time", () => {
    const authCheck = "2026-01-02T00:00:00.000Z";
    const agentCall = "2026-01-03T00:00:00.000Z";
    keyUsage.lastUsedAt = new Date(authCheck);
    confirm.mockResolvedValue(false);
    render(
      <BuilderKeyProvider
        agent={{ name: "Workbench agent", lastActiveAt: new Date(agentCall) }}
      >
        <AgentApiKey />
      </BuilderKeyProvider>,
    );

    expect(screen.queryByText(authCheck)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "key.rotate" }));
    expect(confirm.mock.calls[0]?.[0].description).toContain(
      `Last agent call was ${agentCall}.`,
    );
    expect(confirm.mock.calls[0]?.[0].description).not.toContain(authCheck);
  });
});
