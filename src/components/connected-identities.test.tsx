import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";

const { mockProfileQuery, mockProvidersQuery, mockDisconnect, mockLinkSocial } =
  vi.hoisted(() => ({
    mockProfileQuery: vi.fn(),
    mockProvidersQuery: vi.fn(),
    mockDisconnect: vi.fn(),
    mockLinkSocial: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard/settings",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { linkSocial: mockLinkSocial },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ members: { getMyProfile: { invalidate: vi.fn() } } }),
    members: {
      getMyProfile: { useQuery: mockProfileQuery },
      getAuthProviders: { useQuery: mockProvidersQuery },
      disconnectSocial: {
        useMutation: () => ({ mutate: mockDisconnect, isPending: false }),
      },
    },
  },
}));

import { ConnectedIdentities } from "./connected-identities";

function profile(overrides: {
  accounts: Partial<Record<"google" | "github" | "linkedin", boolean>>;
  canDisconnect?: Partial<Record<"google" | "github" | "linkedin", boolean>>;
}) {
  return {
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      social: {
        github: { handle: "octo" },
        linkedin: null,
        website: null,
      },
      accounts: {
        google: false,
        github: false,
        linkedin: false,
        password: false,
        ...overrides.accounts,
      },
      canDisconnect: {
        google: true,
        github: true,
        linkedin: true,
        ...overrides.canDisconnect,
      },
    },
  };
}

function providers(data: Record<"google" | "github" | "linkedin", boolean>) {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

function renderSettings() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ConnectedIdentities />
    </NextIntlClientProvider>,
  );
}

function rowFor(title: string) {
  const heading = screen.getByText(title, { selector: "span" });
  return heading.closest<HTMLElement>("li")!;
}

describe("ConnectedIdentities", () => {
  beforeEach(() => {
    mockDisconnect.mockReset();
    mockLinkSocial.mockReset();
    mockLinkSocial.mockResolvedValue({ error: null });
    mockProvidersQuery.mockReturnValue(
      providers({ google: true, github: true, linkedin: false }),
    );
  });

  it("is a Settings section with an h2 heading", () => {
    mockProfileQuery.mockReturnValue(profile({ accounts: { github: true } }));
    renderSettings();

    expect(
      screen.getByRole("heading", { level: 2, name: /connected identities/i }),
    ).toBeTruthy();
  });

  it("shows a skeleton while loading, not nothing", () => {
    mockProfileQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = renderSettings();

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows an error with a retry when the profile cannot load", () => {
    const refetch = vi.fn();
    mockProfileQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    renderSettings();

    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("marks a connected Google account as Connected, not Verified", () => {
    mockProfileQuery.mockReturnValue(
      profile({ accounts: { google: true, github: true } }),
    );
    renderSettings();

    const google = rowFor("Google");
    // Sign-in only: no verified check mark on the badge.
    expect(
      within(google).getByText("Connected").querySelector("svg"),
    ).toBeNull();
    expect(within(google).queryByText("Verified")).toBeNull();

    const github = rowFor("GitHub");
    expect(
      within(github).getByText("Verified").querySelector("svg"),
    ).not.toBeNull();
    expect(within(github).getByText("@octo")).toBeTruthy();
  });

  it("hides providers that are neither enabled nor connected", () => {
    mockProfileQuery.mockReturnValue(profile({ accounts: { github: true } }));
    renderSettings();

    expect(rowFor("GitHub")).toBeTruthy();
    expect(screen.queryByText("LinkedIn", { selector: "span" })).toBeNull();
  });

  it("keeps a connected provider listed after its keys are removed", () => {
    mockProvidersQuery.mockReturnValue(
      providers({ google: false, github: true, linkedin: false }),
    );
    mockProfileQuery.mockReturnValue(
      profile({ accounts: { google: true, github: true } }),
    );
    renderSettings();

    expect(rowFor("Google")).toBeTruthy();
  });

  it("connects Google through linkSocial", () => {
    mockProfileQuery.mockReturnValue(profile({ accounts: { github: true } }));
    renderSettings();

    fireEvent.click(
      within(rowFor("Google")).getByRole("button", { name: "Connect Google" }),
    );

    expect(mockLinkSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/en/dashboard/settings",
      errorCallbackURL: "/en/dashboard/settings",
    });
  });

  it("disconnects Google, and blocks it when it is the only sign-in", () => {
    mockProfileQuery.mockReturnValue(
      profile({ accounts: { google: true, github: true } }),
    );
    const { unmount } = renderSettings();
    fireEvent.click(
      within(rowFor("Google")).getByRole("button", { name: "Disconnect" }),
    );
    expect(mockDisconnect).toHaveBeenCalledWith({ provider: "google" });
    unmount();

    mockProfileQuery.mockReturnValue(
      profile({
        accounts: { google: true },
        canDisconnect: { google: false },
      }),
    );
    renderSettings();
    const google = rowFor("Google");
    expect(
      within(google)
        .getByRole("button", { name: "Disconnect" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(google).getByText(
        "Add a password or another sign-in method before disconnecting.",
      ),
    ).toBeTruthy();
  });
  it("still lists connected accounts when the provider list fails", () => {
    const refetch = vi.fn();
    mockProvidersQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    mockProfileQuery.mockReturnValue(profile({ accounts: { google: true } }));
    renderSettings();

    fireEvent.click(
      within(rowFor("Google")).getByRole("button", { name: "Disconnect" }),
    );
    expect(mockDisconnect).toHaveBeenCalledWith({ provider: "google" });
    expect(screen.queryByText("GitHub", { selector: "span" })).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
