import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSignUpEmail, mockUseSession, mockReplace } = vi.hoisted(() => ({
  mockSignUpEmail: vi.fn(),
  mockUseSession: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
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
    signUp: { email: mockSignUpEmail },
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

import { SignUpForm } from "./signup-form";

describe("SignUpForm post-signup landing", () => {
  beforeEach(() => {
    mockSignUpEmail.mockReset();
    mockReplace.mockReset();
    mockUseSession.mockReturnValue({ data: null });
  });

  it("sends verification and OAuth callbacks to Hub, not the homepage", async () => {
    mockSignUpEmail.mockResolvedValue({ error: null });

    render(<SignUpForm linkedinEnabled={false} />);

    expect(screen.getByTestId("social-oauth")).toHaveTextContent(
      "/en/communities/ait",
    );

    fireEvent.change(screen.getByLabelText("NAME"), {
      target: { value: "Ada" },
    });
    fireEvent.change(screen.getByLabelText("EMAIL"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("PASSWORD"), {
      target: { value: "password12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "signUp" }));

    await waitFor(() => {
      expect(mockSignUpEmail).toHaveBeenCalledWith({
        name: "Ada",
        email: "ada@example.com",
        password: "password12",
        callbackURL: "/en/communities/ait",
      });
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });

  it("replaces to Hub once a session exists after signup", () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" } },
    });

    render(<SignUpForm linkedinEnabled={false} />);

    expect(mockReplace).toHaveBeenCalledWith("/en/communities/ait");
    expect(mockReplace).not.toHaveBeenCalledWith("/");
  });
});
