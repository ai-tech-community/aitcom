import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

const session = vi.hoisted(() => ({
  value: {
    data: null as { user: { id: string } } | null,
    isPending: false,
    error: null as Error | null,
  },
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => session.value },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/communities",
}));

import { AuthRequiredProvider, useRequireAuth } from "./auth-required-dialog";

let captured: ReturnType<typeof useRequireAuth> | null = null;
function Capture() {
  captured = useRequireAuth();
  return null;
}

function tree() {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <AuthRequiredProvider>
        <Capture />
      </AuthRequiredProvider>
    </NextIntlClientProvider>
  );
}

function renderProvider() {
  return render(tree());
}

describe("AuthRequiredProvider", () => {
  it("returns guests to the current page by default", () => {
    session.value = { data: null, isPending: false, error: null };
    renderProvider();
    act(() => captured!.promptAuth("Sign in to test"));
    expect(
      screen.getByRole("link", { name: /sign in/i }).getAttribute("href"),
    ).toBe("/auth/signin?redirect=%2Fen%2Fcommunities");
  });

  it("uses an explicit return path when one is given", () => {
    session.value = { data: null, isPending: false, error: null };
    renderProvider();
    const action = vi.fn();
    act(() =>
      captured!.requireAuth(action, "Sign in to create a community", {
        returnTo: "/en/communities?create=1",
      }),
    );
    expect(action).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /sign in/i }).getAttribute("href"),
    ).toBe("/auth/signin?redirect=%2Fen%2Fcommunities%3Fcreate%3D1");
    expect(
      screen
        .getByRole("link", { name: /create account/i })
        .getAttribute("href"),
    ).toBe("/auth/signup?redirect=%2Fen%2Fcommunities%3Fcreate%3D1");
  });

  it("reports the session status", () => {
    session.value = { data: null, isPending: true, error: null };
    const view = renderProvider();
    expect(captured!.authStatus).toBe("pending");

    session.value = { data: null, isPending: false, error: null };
    view.rerender(tree());
    expect(captured!.authStatus).toBe("guest");

    session.value = {
      data: { user: { id: "u1" } },
      isPending: false,
      error: null,
    };
    view.rerender(tree());
    expect(captured!.authStatus).toBe("authenticated");
  });

  it("reports unknown when the session fetch failed", () => {
    session.value = {
      data: null,
      isPending: false,
      error: new Error("network"),
    };
    renderProvider();
    expect(captured!.authStatus).toBe("unknown");
  });

  it("runs the action directly for a signed-in user", () => {
    session.value = {
      data: { user: { id: "u1" } },
      isPending: false,
      error: null,
    };
    renderProvider();
    const action = vi.fn();
    act(() => captured!.requireAuth(action, "x", { returnTo: "/x" }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("explains the action when the caller has a better line", () => {
    session.value = { data: null, isPending: false, error: null };
    renderProvider();
    act(() =>
      captured!.promptAuth("Sign in to join ACME", {
        description: "We'll bring you back and finish joining ACME.",
      }),
    );
    expect(
      screen.getByText("We'll bring you back and finish joining ACME."),
    ).toBeInTheDocument();
  });

  it("falls back to the generic explanation", () => {
    session.value = { data: null, isPending: false, error: null };
    renderProvider();
    act(() => captured!.promptAuth());
    expect(screen.getByText(en.auth.promptBody)).toBeInTheDocument();
    expect(screen.getByText(en.auth.promptTitle)).toBeInTheDocument();
  });
});
