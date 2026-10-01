import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const s = vi.hoisted(() => ({
  authStatus: "authenticated" as "authenticated" | "guest" | "pending",
  mine: [] as { slug: string; status: string; role: string }[],
  promptAuth: vi.fn(),
  join: vi.fn(() => Promise.resolve({ success: true })),
  request: vi.fn(() => Promise.resolve({ success: true })),
  leave: vi.fn(() => Promise.resolve({ success: true })),
  fetchCommunity: vi.fn(() =>
    Promise.resolve({ name: "ACME", joinPolicy: "open" as const }),
  ),
  toast: vi.fn(),
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
vi.mock("sonner", () => ({ toast: { success: s.toast } }));
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
      },
    },
  };
});

import { useCommunityJoin, useJoinDeepLink } from "./use-community-join";

afterEach(() => {
  s.authStatus = "authenticated";
  s.mine = [];
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
      { returnTo: "/en/communities?q=ml&join=acme" },
    );
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

  it("does not join again when already a member", async () => {
    s.mine = [{ slug: "acme", status: "active", role: "member" }];
    window.history.replaceState(null, "", "/en/communities?join=acme");
    renderHook(() => useJoinDeepLink());
    await waitFor(() => expect(s.fetchCommunity).toHaveBeenCalled());
    expect(s.join).not.toHaveBeenCalled();
  });
});
