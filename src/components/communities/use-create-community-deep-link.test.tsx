import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  status: "authenticated" as "pending" | "authenticated" | "guest" | "unknown",
  requireAuth: vi.fn(),
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    requireAuth: auth.requireAuth,
    promptAuth: vi.fn(),
    authStatus: auth.status,
  }),
}));

import { useCreateCommunityDeepLink } from "./use-create-community-deep-link";
import {
  CREATE_COMMUNITY_HREF,
  CREATE_COMMUNITY_PARAM,
} from "./create-community-link";

function Harness({ open }: { open: () => void }) {
  useCreateCommunityDeepLink(open, "Sign in to create a community");
  return null;
}

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

beforeEach(() => {
  auth.status = "authenticated";
  // Mirror AuthRequiredProvider: run the action only when signed in.
  auth.requireAuth.mockReset();
  auth.requireAuth.mockImplementation((action: () => void) => {
    if (auth.status === "authenticated") action();
  });
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useCreateCommunityDeepLink", () => {
  it("exposes the link the homepage uses", () => {
    expect(CREATE_COMMUNITY_HREF).toBe(
      `/communities?${CREATE_COMMUNITY_PARAM}=1`,
    );
  });

  it("opens the dialog for a signed-in member and strips the param", () => {
    window.history.replaceState(null, "", "/en/communities?create=1&q=ai#top");
    const open = vi.fn();
    render(<Harness open={open} />);
    expect(open).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/en/communities?q=ai");
    expect(window.location.hash).toBe("#top");
  });

  it("sends a guest to sign-in with a return path that keeps ?create=1", () => {
    auth.status = "guest";
    window.history.replaceState(null, "", "/nl/communities?create=1");
    const open = vi.fn();
    render(<Harness open={open} />);
    expect(open).not.toHaveBeenCalled();
    expect(auth.requireAuth).toHaveBeenCalledWith(
      expect.any(Function),
      "Sign in to create a community",
      { returnTo: "/nl/communities?create=1" },
    );
    expect(currentUrl()).toBe("/nl/communities");
  });

  it("waits for the session before deciding", () => {
    auth.status = "pending";
    window.history.replaceState(null, "", "/en/communities?create=1");
    const open = vi.fn();
    const view = render(<Harness open={open} />);
    expect(auth.requireAuth).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/en/communities?create=1");

    auth.status = "authenticated";
    view.rerender(<Harness open={open} />);
    expect(open).toHaveBeenCalledTimes(1);
    expect(currentUrl()).toBe("/en/communities");
  });

  it("does not act when the session fetch failed", () => {
    auth.status = "unknown";
    window.history.replaceState(null, "", "/en/communities?create=1");
    const open = vi.fn();
    const view = render(<Harness open={open} />);
    expect(auth.requireAuth).not.toHaveBeenCalled();
    expect(currentUrl()).toBe("/en/communities?create=1");

    // A later successful refetch still honours the link.
    auth.status = "authenticated";
    view.rerender(<Harness open={open} />);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does nothing without the param", () => {
    window.history.replaceState(null, "", "/en/communities?create=0");
    const open = vi.fn();
    render(<Harness open={open} />);
    expect(open).not.toHaveBeenCalled();
    expect(auth.requireAuth).not.toHaveBeenCalled();
  });

  it("opens only once, even when the session changes later", () => {
    window.history.replaceState(null, "", "/en/communities?create=1");
    const open = vi.fn();
    const view = render(<Harness open={open} />);
    auth.status = "guest";
    view.rerender(<Harness open={open} />);
    auth.status = "authenticated";
    view.rerender(<Harness open={open} />);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
