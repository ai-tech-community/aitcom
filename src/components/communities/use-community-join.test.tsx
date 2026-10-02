import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const s = vi.hoisted(() => ({
  authStatus: "authenticated" as
    | "authenticated"
    | "guest"
    | "pending"
    | "unknown",
  initialUser: null as { id: string } | null,
  mine: [] as { slug: string; status: string; role: string }[],
  promptAuth: vi.fn(),
  join: vi.fn(() => Promise.resolve({ success: true })),
  request: vi.fn(() => Promise.resolve({ success: true })),
  leave: vi.fn(() => Promise.resolve({ success: true })),
  accept: vi.fn((_: { slug: string }) => Promise.resolve({ success: true })),
  fetchCommunity: vi.fn(() =>
    Promise.resolve({
      name: "ACME",
      joinPolicy: "open" as "open" | "invite_only",
    }),
  ),
  toast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({
    authStatus: s.authStatus,
    promptAuth: s.promptAuth,
  }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}));
vi.mock("sonner", () => ({
  toast: { success: s.toast, error: s.toastError },
}));
vi.mock("@/components/auth/session-provider", () => ({
  useInitialAuthUser: () => s.initialUser,
}));
vi.mock("@/trpc/react", () => {
  const invalidate = () => Promise.resolve();
  return {
    api: {
      useUtils: () => ({
        communities: {
          getMyCommunities: {
            invalidate,
            fetch: () => Promise.resolve(s.mine),
          },
          getBySlug: { invalidate, fetch: s.fetchCommunity },
          getMembers: { invalidate },
          directory: { invalidate },
        },
        home: { nextUp: { invalidate } },
        feed: { getHomeActivity: { invalidate } },
      }),
      communities: {
        getMyCommunities: {
          useQuery: (_: unknown, opts: { enabled: boolean }) => ({
            data: opts.enabled ? s.mine : undefined,
          }),
        },
        join: { useMutation: () => ({ mutateAsync: s.join }) },
        requestToJoin: { useMutation: () => ({ mutateAsync: s.request }) },
        leave: { useMutation: () => ({ mutateAsync: s.leave }) },
        acceptInvite: { useMutation: () => ({ mutateAsync: s.accept }) },
        declineInvite: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      },
    },
  };
});

import { useCommunityJoin, useJoinDeepLink } from "./use-community-join";
import { rememberJoinIntent } from "./join-community-link";

afterEach(() => {
  s.authStatus = "authenticated";
  s.initialUser = null;
  s.mine = [];
  s.join.mockImplementation(() => Promise.resolve({ success: true }));
  window.sessionStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useCommunityJoin", () => {
  it("joins an open community and says so", async () => {
    const { result } = renderHook(() =>
      useCommunityJoin({ slug: "acme", name: "ACME", joinPolicy: "open" }),
    );
    expect(result.current.action).toEqual({ kind: "join" });
    await act(() => result.current.run());
    expect(s.join).toHaveBeenCalledWith({ slug: "acme" });
    expect(s.toast).toHaveBeenCalledWith('joined:{"community":"ACME"}');
  });

  it("requests to join an approval community", async () => {
    const { result } = renderHook(() =>
      useCommunityJoin({
        slug: "acme",
        name: "ACME",
        joinPolicy: "approval_required",
      }),
    );
    await act(() => result.current.run());
    expect(s.request).toHaveBeenCalledWith({ slug: "acme" });
    expect(s.join).not.toHaveBeenCalled();
  });

  it("sends a guest to sign in and back with ?join=", async () => {
    s.authStatus = "guest";
    window.history.replaceState(null, "", "/en/communities?q=ml");
    const { result } = renderHook(() =>
      useCommunityJoin({ slug: "acme", name: "ACME", joinPolicy: "open" }),
    );
    await act(() => result.current.run());
    expect(s.join).not.toHaveBeenCalled();
    expect(s.promptAuth).toHaveBeenCalledWith(
      'signInToJoin:{"community":"ACME"}',
      {
        returnTo: "/en/communities?q=ml&join=acme",
        description: 'signInToJoinBody:{"community":"ACME"}',
      },
    );
  });

  it("trusts the server's user while the session is still loading", async () => {
    s.authStatus = "pending";
    s.initialUser = { id: "u1" };
    const { result } = renderHook(() =>
      useCommunityJoin({ slug: "acme", name: "ACME", joinPolicy: "open" }),
    );
    await act(() => result.current.run());
    expect(s.promptAuth).not.toHaveBeenCalled();
    expect(s.join).toHaveBeenCalledWith({ slug: "acme" });
  });

  it("says plainly when a join fails", async () => {
    s.join.mockImplementation(() => Promise.reject(new Error("boom")));
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useCommunityJoin({
        slug: "acme",
        name: "ACME",
        joinPolicy: "open",
        onChange,
      }),
    );
    await act(() => result.current.run());
    expect(s.toastError).toHaveBeenCalledWith(
      'joinFailed:{"community":"ACME"}',
    );
    expect(s.toast).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it("reads the viewer's membership from the page-wide lookup", () => {
    s.mine = [{ slug: "acme", status: "active", role: "member" }];
    const { result } = renderHook(() =>
      useCommunityJoin({ slug: "acme", name: "ACME", joinPolicy: "open" }),
    );
    expect(result.current.action).toEqual({ kind: "member", canLeave: true });
  });

  it("prefers a membership the caller already knows", () => {
    s.mine = [{ slug: "acme", status: "active", role: "member" }];
    const { result } = renderHook(() =>
      useCommunityJoin({
        slug: "acme",
        joinPolicy: "open",
        membership: null,
      }),
    );
    expect(result.current.action).toEqual({ kind: "join" });
  });

  it("uses generic wording without a name", async () => {
    const { result } = renderHook(() =>
      useCommunityJoin({ slug: "acme", joinPolicy: "open" }),
    );
    await act(() => result.current.run());
    expect(s.toast).toHaveBeenCalledWith("joinedGeneric");
  });
});

describe("useJoinDeepLink", () => {
  it("finishes the join after sign-in and drops the param", async () => {
    rememberJoinIntent("acme");
    window.history.replaceState(null, "", "/en/communities?q=ml&join=acme");
    const onDone = vi.fn();
    renderHook(() => useJoinDeepLink(onDone));
    await waitFor(() => expect(s.join).toHaveBeenCalledWith({ slug: "acme" }));
    expect(window.location.search).toBe("?q=ml");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("waits until the visitor is signed in", () => {
    s.authStatus = "pending";
    window.history.replaceState(null, "", "/en/communities?join=acme");
    renderHook(() => useJoinDeepLink());
    expect(s.join).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?join=acme");
  });

  it("ignores a join link this browser did not ask for", async () => {
    window.history.replaceState(null, "", "/en/communities?join=acme");
    renderHook(() => useJoinDeepLink());
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(s.fetchCommunity).not.toHaveBeenCalled();
    expect(s.join).not.toHaveBeenCalled();
  });

  it("accepts the invitation waiting for a member who pressed Join signed out", async () => {
    rememberJoinIntent("acme");
    s.fetchCommunity.mockImplementationOnce(() =>
      Promise.resolve({ name: "ACME", joinPolicy: "invite_only" }),
    );
    s.mine = [{ slug: "acme", status: "invited", role: "member" }];
    window.history.replaceState(null, "", "/en/communities/acme?join=acme");
    const onDone = vi.fn();
    renderHook(() => useJoinDeepLink(onDone));
    await waitFor(() =>
      expect(s.accept).toHaveBeenCalledWith({ slug: "acme" }),
    );
    expect(s.join).not.toHaveBeenCalled();
    // The same feedback as a join.
    await waitFor(() =>
      expect(s.toast).toHaveBeenCalledWith('joined:{"community":"ACME"}'),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("does not join again when already a member", async () => {
    rememberJoinIntent("acme");
    s.mine = [{ slug: "acme", status: "active", role: "member" }];
    window.history.replaceState(null, "", "/en/communities?join=acme");
    renderHook(() => useJoinDeepLink());
    await waitFor(() => expect(s.fetchCommunity).toHaveBeenCalled());
    expect(s.join).not.toHaveBeenCalled();
  });
});
