import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSignInEmail,
  mockSendVerificationEmail,
  mockUseSession,
  mockPush,
  mockReplace,
} = vi.hoisted(() => ({
  mockSignInEmail: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
  mockUseSession: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
  SocialOAuthButtons: () => <div data-testid="social-oauth" />,
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
        callbackURL: "/",
      });
    });
  });
});
