import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({ segments: [] as string[] }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  useSelectedLayoutSegments: () => m.segments,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getBySlug: {
        useQuery: () => ({
          data: { slug: "mlops", name: "MLOps" },
          isLoading: false,
        }),
      },
      getMyCommunities: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/components/auth/session-provider", () => ({
  PageDocumentAuthProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/components/communities/use-community-join", () => ({
  useJoinDeepLink: () => undefined,
}));
vi.mock("@/components/communities/community-identity", () => ({
  CommunityIdentity: () => <div data-testid="identity" />,
}));
vi.mock("@/components/communities/community-nav", () => ({
  CommunityNav: () => <nav data-testid="nav" />,
}));

import { CommunityLayoutClient } from "./_community-layout-client";

async function renderLayout() {
  const params = Promise.resolve({ slug: "mlops", locale: "en" });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <CommunityLayoutClient
          params={params}
          initialUser={null}
          initialMemberships={[]}
        >
          <p data-testid="page">page</p>
        </CommunityLayoutClient>
      </Suspense>,
    );
    await params;
  });
  return result;
}

beforeEach(() => {
  m.segments = [];
});

describe("CommunityLayoutClient frame", () => {
  it("puts identity and tabs in the rail, once, and the page beside it", async () => {
    const { container } = await renderLayout();
    const rail = container.querySelector("[data-community-rail]");
    expect(screen.getAllByTestId("identity")).toHaveLength(1);
    expect(screen.getAllByTestId("nav")).toHaveLength(1);
    expect(rail).toContainElement(screen.getByTestId("identity"));
    expect(rail).toContainElement(screen.getByTestId("nav"));
    expect(rail).not.toContainElement(screen.getByTestId("page"));
  });

  it("drops the rail wrapper below lg so the tab bar can stick", async () => {
    const { container } = await renderLayout();
    const rail = container.querySelector("[data-community-rail]");
    expect(rail?.className).toMatch(/^contents\b/);
    expect(rail?.className).toMatch(/\blg:sticky\b/);
  });

  it("is full width: no centred max-width column", async () => {
    const { container } = await renderLayout();
    expect(container.innerHTML).not.toMatch(/max-w-5xl/);
  });

  it("draws no frame around a workspace route", async () => {
    m.segments = ["events", "new"];
    const { container } = await renderLayout();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("identity")).toBeNull();
    expect(container.querySelector("[data-community-rail]")).toBeNull();
  });
});
