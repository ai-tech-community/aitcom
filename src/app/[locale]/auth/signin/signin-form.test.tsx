import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSignInEmail,
  mockSendVerificationEmail,
  mockUseSession,
  mockPush,
  mockReplace,
  mockRefresh,
} = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
  mockUseSession: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: mockUseSession,
    signIn: { email: mockSignInEmail },
    sendVerificationEmail: mockSendVerificationEmail,
  },
}));

vi.mock("@/components/auth/social-oauth-buttons", () => ({
  SocialOAuthButtons: ({ callbackURL }: { callbackURL: string }) => (
    <div data-testid="social-oauth">{callbackURL}</div>
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { SignInForm } from "./signin-form";

describe("SignInForm EMAIL_NOT_VERIFIED", () => {
  beforeEach(() => {
    mockSignInEmail.mockReset();
    mockSendVerificationEmail.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockUseSession.mockReturnValue({ data: null });
  });

  it("shows a resend action instead of swallowing EMAIL_NOT_VERIFIED", async () => {
    mockSignInEmail.mockResolvedValue({
      error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
    });
    mockSendVerificationEmail.mockResolvedValue({ error: null });

    render(<SignInForm linkedinEnabled={false} />);

    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "greg+qa-human@klevox.com" },
    });
    fireEvent.change(screen.getByLabelText("PASSWORD"), {
      target: { value: "password12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "signIn" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "emailNotVerified",
    );
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "resendVerification" }));

    await waitFor(() => {
      expect(mockSendVerificationEmail).toHaveBeenCalledWith({
        email: "greg+qa-human@klevox.com",
        callbackURL: "/en/communities/ait",
      });
    });
  });

  it("lands in Hub after a successful sign-in with no redirect param", async () => {
    mockSignInEmail.mockResolvedValue({ error: null });

    render(<SignInForm linkedinEnabled={false} />);

    expect(screen.getByTestId("social-oauth")).toHaveTextContent(
      "/en/communities/ait",
    );

    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("PASSWORD"), {
      target: { value: "password12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "signIn" }));

    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "password12",
        callbackURL: "/en/communities/ait",
      });
      expect(mockPush).toHaveBeenCalledWith("/en/communities/ait");
    });
    expect(mockRefresh).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalledWith("/");
  });

  it("www password sign-in navigates to www Hub, never apex", async () => {
    const wwwOrigin = "https://www.aitcommunity.org";
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: wwwOrigin,
        href: `${wwwOrigin}/en/auth/signin`,
        assign,
      },
    });
    mockSignInEmail.mockResolvedValue({ error: null });

    render(<SignInForm linkedinEnabled={false} />);

    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("PASSWORD"), {
      target: { value: "password12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "signIn" }));

    const wwwHub = `${wwwOrigin}/en/communities/ait`;
    await waitFor(() => {
      expect(mockSignInEmail).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "password12",
        callbackURL: wwwHub,
      });
      expect(assign).toHaveBeenCalledWith(wwwHub);
    });
    expect(assign).not.toHaveBeenCalledWith(
      "https://aitcommunity.org/en/communities/ait",
    );
    expect(mockPush).not.toHaveBeenCalledWith("/en/communities/ait");
    expect(mockPush).not.toHaveBeenCalledWith(
      "https://aitcommunity.org/en/communities/ait",
    );
  });
});
