import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  status: "authenticated" as "pending" | "authenticated" | "guest",
  promptAuth: vi.fn(),
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: auth.status,
    promptAuth: auth.promptAuth,
    requireAuth: (
      action: () => void,
      intent?: string,
      options?: { returnTo?: string },
    ) => {
      if (auth.status === "authenticated") action();
      else auth.promptAuth(intent, options);
    },
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ communities: { invalidate: vi.fn() } }),
    communities: {
      create: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));
vi.mock("@/components/community/building-modal", () => ({
  BuildingModal: ({
    isOpen,
    children,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
  }) => (isOpen ? <div role="dialog">{children}</div> : null),
}));

import { CreateCommunityDialog } from "./create-community-dialog";

// Radix Select (inside the form) measures itself; jsdom lacks ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  },
);

afterEach(() => {
  window.history.replaceState(null, "", "/");
  auth.promptAuth.mockReset();
});

describe("CreateCommunityDialog deep link", () => {
  it("stays closed on a plain visit", () => {
    window.history.replaceState(null, "", "/en/communities");
    render(<CreateCommunityDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from ?create=1 for a signed-in member", () => {
    auth.status = "authenticated";
    window.history.replaceState(null, "", "/en/communities?create=1");
    render(<CreateCommunityDialog />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("asks a guest to sign in and comes back to ?create=1", () => {
    auth.status = "guest";
    window.history.replaceState(null, "", "/en/communities?create=1");
    render(<CreateCommunityDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(auth.promptAuth).toHaveBeenCalledWith(
      "Sign in to create a community",
      { returnTo: "/en/communities?create=1" },
    );
  });
});
