import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const { mockSignInSocial, mockUseQuery } = vi.hoisted(() => ({
  mockSignInSocial: vi.fn(),
  mockUseQuery: vi.fn(),
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { signIn: { social: mockSignInSocial } },
}));

vi.mock("@/trpc/react", () => ({
  api: { members: { getAuthProviders: { useQuery: mockUseQuery } } },
}));

import { SocialOAuthButtons } from "./social-oauth-buttons";

type Enabled = { google: boolean; github: boolean; linkedin: boolean };

function renderButtons(enabled: Enabled) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SocialOAuthButtons
        callbackURL="/en/dashboard"
        enabledProviders={enabled}
      />
    </NextIntlClientProvider>,
  );
}

describe("SocialOAuthButtons", () => {
  beforeEach(() => {
    mockSignInSocial.mockReset();
    mockUseQuery.mockReset();
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
    });
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
});
