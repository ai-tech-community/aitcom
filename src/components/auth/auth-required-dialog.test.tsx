import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const session = vi.hoisted(() => ({
  value: { data: null as { user: { id: string } } | null, isPending: false },
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

function renderProvider() {
  return render(
    <AuthRequiredProvider>
      <Capture />
    </AuthRequiredProvider>,
  );
}

describe("AuthRequiredProvider", () => {
  it("returns guests to the current page by default", () => {
    session.value = { data: null, isPending: false };
    renderProvider();
    act(() => captured!.promptAuth("Sign in to test"));
    expect(
      screen.getByRole("link", { name: /sign in/i }).getAttribute("href"),
    ).toBe("/auth/signin?redirect=%2Fen%2Fcommunities");
  });

  it("uses an explicit return path when one is given", () => {
    session.value = { data: null, isPending: false };
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
    session.value = { data: null, isPending: true };
    const view = renderProvider();
    expect(captured!.authStatus).toBe("pending");

    session.value = { data: null, isPending: false };
    view.rerender(
      <AuthRequiredProvider>
        <Capture />
      </AuthRequiredProvider>,
    );
    expect(captured!.authStatus).toBe("guest");

    session.value = { data: { user: { id: "u1" } }, isPending: false };
    view.rerender(
      <AuthRequiredProvider>
        <Capture />
      </AuthRequiredProvider>,
    );
    expect(captured!.authStatus).toBe("authenticated");
  });

  it("runs the action directly for a signed-in user", () => {
    session.value = { data: { user: { id: "u1" } }, isPending: false };
    renderProvider();
    const action = vi.fn();
    act(() => captured!.requireAuth(action, "x", { returnTo: "/x" }));
    expect(action).toHaveBeenCalledTimes(1);
  });
});
