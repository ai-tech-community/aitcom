import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

const { mockSignInSocial, mockUseQuery, search } = vi.hoisted(() => ({
  mockSignInSocial: vi.fn(),
  mockUseQuery: vi.fn(),
  search: { value: "" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/auth/signin",
  useSearchParams: () => new URLSearchParams(search.value),
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { signIn: { social: mockSignInSocial } },
}));

vi.mock("@/trpc/react", () => ({
  api: { members: { getAuthProviders: { useQuery: mockUseQuery } } },
}));

import { SocialOAuthButtons } from "./social-oauth-buttons";

type Enabled = { google: boolean; github: boolean; linkedin: boolean };

function renderButtons(enabled: Enabled, locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <SocialOAuthButtons
        callbackURL="/en/dashboard"
        enabledProviders={enabled}
      />
    </NextIntlClientProvider>,
  );
}

describe("SocialOAuthButtons", () => {
  beforeEach(() => {
    mockSignInSocial.mockReset().mockResolvedValue({ error: null });
    mockUseQuery.mockReset();
    search.value = "";
    mockUseQuery.mockImplementation(
      (_input: undefined, opts: { initialData: Enabled }) => ({
        data: opts.initialData,
      }),
    );
  });

  it("shows only enabled providers, Google first", () => {
    renderButtons({ google: true, github: true, linkedin: false });

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Continue with Google", "Continue with GitHub"]);
  });

  it("starts the Google flow with the callback URL", () => {
    renderButtons({ google: true, github: true, linkedin: false });

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/en/dashboard",
      errorCallbackURL: "/en/auth/signin",
    });
  });

  it.each(["google", "github", "linkedin"] as const)(
    "shows immediate feedback for %s and blocks repeated social sign-in",
    async (provider) => {
      let finish!: (result: { error: null }) => void;
      mockSignInSocial.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      renderButtons({ google: true, github: true, linkedin: true });
      const selected = screen.getByRole("button", { name: en.auth[provider] });

      fireEvent.click(selected);

      expect(selected).toHaveTextContent(en.auth.signingIn);
      expect(selected).toHaveAttribute("aria-busy", "true");
      expect(screen.getByRole("status")).toHaveTextContent(en.auth.signingIn);
      for (const button of screen.getAllByRole("button")) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
      expect(mockSignInSocial).toHaveBeenCalledTimes(1);

      // Better Auth starts navigation before resolving. Keep feedback visible
      // while the browser is still loading the provider's page.
      await act(async () => finish({ error: null }));
      expect(selected).toHaveTextContent(en.auth.signingIn);
      expect(selected).toBeDisabled();
    },
  );

  it.each(["returned", "thrown"])(
    "shows a retryable error after a %s request failure",
    async (failure) => {
      if (failure === "returned") {
        mockSignInSocial.mockResolvedValueOnce({
          error: { message: "Internal server error", status: 500 },
        });
      } else {
        mockSignInSocial.mockRejectedValueOnce(new Error("Network failed"));
      }
      renderButtons({ google: true, github: true, linkedin: true });

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: en.auth.google }));
      });

      expect(screen.getByRole("alert")).toHaveTextContent(en.auth.oauthFailed);
      expect(screen.queryByRole("status")).toBeEmptyDOMElement();
      for (const button of screen.getAllByRole("button")) {
        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute("aria-busy", "true");
      }

      fireEvent.click(screen.getByRole("button", { name: en.auth.github }));
      expect(screen.queryByRole("alert")).toBeNull();
      expect(mockSignInSocial).toHaveBeenLastCalledWith(
        expect.objectContaining({ provider: "github" }),
      );
    },
  );

  it("uses Dutch loading and error feedback", async () => {
    mockSignInSocial.mockResolvedValueOnce({ error: { status: 500 } });
    renderButtons({ google: true, github: false, linkedin: false }, "nl");

    fireEvent.click(screen.getByRole("button", { name: nl.auth.google }));
    expect(screen.getByRole("status")).toHaveTextContent(nl.auth.signingIn);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      nl.auth.oauthFailed,
    );
  });

  it("allows another attempt after Back restores the page from the provider", async () => {
    renderButtons({ google: true, github: true, linkedin: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: en.auth.google }));
    });
    expect(
      screen.getByRole("button", { name: en.auth.signingIn }),
    ).toBeDisabled();

    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeEnabled();
    }
    fireEvent.click(screen.getByRole("button", { name: en.auth.github }));
    expect(mockSignInSocial).toHaveBeenCalledTimes(2);
    expect(mockSignInSocial).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "github" }),
    );
  });

  it("clears a previous callback error when retrying", () => {
    search.value = "error=account_not_linked";
    renderButtons({ google: true, github: false, linkedin: false });
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: en.auth.google }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides Google when its keys are not set", () => {
    renderButtons({ google: false, github: true, linkedin: true });

    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).toBeNull();
  });

  it("follows the server answer over the page snapshot", () => {
    mockUseQuery.mockReturnValue({
      data: { google: true, github: false, linkedin: false },
    });
    renderButtons({ google: false, github: false, linkedin: false });

    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeTruthy();
  });

  it("returns errors to this page, keeping its query but not an old error", () => {
    search.value = "redirect=%2Fen%2Fevents&error=account_not_linked";
    renderButtons({ google: true, github: false, linkedin: false });

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(mockSignInSocial).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCallbackURL: "/en/auth/signin?redirect=%2Fen%2Fevents",
      }),
    );
  });

  it("explains an unverified provider email in plain words", () => {
    search.value = "error=account_not_linked";
    renderButtons({ google: true, github: false, linkedin: false });

    expect(screen.getByRole("alert").textContent).toBe(
      en.auth.oauthUnverifiedEmail,
    );
  });

  it("shows nothing when the member cancelled at the provider", () => {
    search.value = "error=access_denied";
    renderButtons({ google: true, github: false, linkedin: false });

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
