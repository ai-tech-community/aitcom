// The community layout prefetches the community on the server, so the
// client layout's `getBySlug` query already holds it on first paint
// instead of starting with a spinner.
import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redesigned: false,
  prefetchSpaces: vi.fn(),
  prefetchRooms: vi.fn(),
  prefetch: vi.fn<(input: { slug: string }) => Promise<void>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => state.redesigned,
}));
vi.mock("@/trpc/server", () => ({
  api: {
    communities: { getBySlug: { prefetch: state.prefetch } },
    spaces: {
      list: { prefetch: state.prefetchSpaces },
      listRooms: { prefetch: state.prefetchRooms },
    },
  },
  HydrateClient: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hydrate">{children}</div>
  ),
}));
vi.mock("@/server/better-auth/hub-session-server", () => ({
  loadHubAuthSeed: async () => ({
    initialUser: { id: "user-1" },
    initialMemberships: [{ slug: "belong", status: "active", role: "member" }],
  }),
}));
vi.mock("./_community-layout-client", () => ({
  CommunityLayoutClient: ({
    children,
    initialUser,
    initialMemberships,
  }: {
    children: React.ReactNode;
    initialUser: { id: string } | null;
    initialMemberships: { slug: string }[];
  }) => (
    <div
      data-testid="community-layout"
      data-user={initialUser?.id ?? "none"}
      data-memberships={initialMemberships.map((m) => m.slug).join(",")}
    >
      {children}
    </div>
  ),
}));

import CommunityLayout, { dynamic } from "./layout";

const params = () => Promise.resolve({ locale: "en", slug: "belong" });

beforeEach(() => {
  state.redesigned = false;
  state.prefetchSpaces.mockReset();
  state.prefetchRooms.mockReset();
  state.prefetch.mockReset();
  state.prefetch.mockResolvedValue(undefined);
});

describe("community layout", () => {
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("prefetches the community and renders the frame inside HydrateClient", async () => {
    const layout = await CommunityLayout({
      children: <p>page</p>,
      params: params(),
    });
    render(layout);

    expect(state.prefetch).toHaveBeenCalledTimes(1);
    expect(state.prefetch).toHaveBeenCalledWith({ slug: "belong" });
    expect(state.prefetchSpaces).not.toHaveBeenCalled();
    expect(state.prefetchRooms).not.toHaveBeenCalled();
    const frame = screen.getByTestId("community-layout");
    expect(frame.parentElement).toBe(screen.getByTestId("hydrate"));
    expect(frame).toHaveAttribute("data-user", "user-1");
    expect(frame).toHaveAttribute("data-memberships", "belong");
    expect(screen.getByText("page").parentElement).toBe(frame);
  });

  it("prefetches the ordered space and room lists for the redesigned frame", async () => {
    state.redesigned = true;
    await CommunityLayout({ children: <p>page</p>, params: params() });
    expect(state.prefetchSpaces).toHaveBeenCalledWith({ slug: "belong" });
    expect(state.prefetchRooms).toHaveBeenCalledWith({ slug: "belong" });
  });

  it("starts both navigation reads while the independent community read is pending", async () => {
    state.redesigned = true;
    let release!: () => void;
    state.prefetch.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const layout = CommunityLayout({ children: <p>page</p>, params: params() });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.prefetchSpaces).toHaveBeenCalledWith({ slug: "belong" });
    expect(state.prefetchRooms).toHaveBeenCalledWith({ slug: "belong" });
    release();
    await layout;
  });

  it("still renders the frame when the community is missing", async () => {
    // tRPC's `prefetch` is TanStack's `prefetchQuery`: a NOT_FOUND lands in
    // the cache, the call itself resolves. Run that real path, so the
    // layout hands the frame over and the client takes notFound() itself.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    state.prefetch.mockImplementation(({ slug }) =>
      queryClient.prefetchQuery({
        queryKey: ["communities.getBySlug", slug],
        queryFn: () => Promise.reject(new TRPCError({ code: "NOT_FOUND" })),
      }),
    );

    const layout = await CommunityLayout({
      children: <p>page</p>,
      params: Promise.resolve({ locale: "en", slug: "gone" }),
    });
    render(layout);

    expect(state.prefetch).toHaveBeenCalledWith({ slug: "gone" });
    expect(
      queryClient.getQueryState(["communities.getBySlug", "gone"])?.status,
    ).toBe("error");
    expect(screen.getByTestId("community-layout").parentElement).toBe(
      screen.getByTestId("hydrate"),
    );
  });

  it("waits for the prefetch before it hands over the frame", async () => {
    // HydrateClient snapshots the query cache when it renders. A prefetch
    // still running then is sent as pending, and the client paints a spinner.
    let finishPrefetch: () => void = () => undefined;
    state.prefetch.mockReturnValue(
      new Promise<void>((resolve) => {
        finishPrefetch = resolve;
      }),
    );
    let settled = false;
    const layout = CommunityLayout({
      children: <p>page</p>,
      params: params(),
    }).then((result) => {
      settled = true;
      return result;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    finishPrefetch();
    await layout;
    expect(settled).toBe(true);
  });
});
