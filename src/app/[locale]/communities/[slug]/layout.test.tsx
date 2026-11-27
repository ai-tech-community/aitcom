// The community layout prefetches the community on the server, so the
// client layout's `getBySlug` query already holds it on first paint
// instead of starting with a spinner.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  prefetch: vi.fn<(input: { slug: string }) => Promise<void>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/trpc/server", () => ({
  api: { communities: { getBySlug: { prefetch: state.prefetch } } },
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
    const frame = screen.getByTestId("community-layout");
    expect(frame.parentElement).toBe(screen.getByTestId("hydrate"));
    expect(frame).toHaveAttribute("data-user", "user-1");
    expect(frame).toHaveAttribute("data-memberships", "belong");
    expect(screen.getByText("page").parentElement).toBe(frame);
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
