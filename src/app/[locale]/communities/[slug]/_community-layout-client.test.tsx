import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  segments: [] as string[],
  identityProps: [] as { density?: string }[],
  community: {
    data: { slug: "mlops", name: "MLOps" } as
      | { slug: string; name: string }
      | undefined,
    isPending: false,
    isLoading: false,
    isError: false,
  },
}));

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
        useQuery: () => m.community,
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
  CommunityIdentity: (props: { density?: string }) => {
    m.identityProps.push(props);
    return <div data-testid="identity" />;
  },
}));
vi.mock("@/components/communities/community-nav", () => ({
  CommunityNav: () => <nav data-testid="nav" />,
}));

import type { HubMembershipSeed } from "@/server/better-auth/hub-session";
import { CommunityLayoutClient } from "./_community-layout-client";

async function renderLayout(initialMemberships: HubMembershipSeed[] = []) {
  const params = Promise.resolve({ slug: "mlops", locale: "en" });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <CommunityLayoutClient
          params={params}
          initialUser={null}
          initialMemberships={initialMemberships}
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
  m.identityProps = [];
  m.community = {
    data: { slug: "mlops", name: "MLOps" },
    isPending: false,
    isLoading: false,
    isError: false,
  };
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

  it("waits for the community query before deciding the page is missing", async () => {
    m.segments = ["magazine", "issues", "5", "edit"];
    m.community = {
      data: undefined,
      isPending: true,
      isLoading: false,
      isError: false,
    };
    await renderLayout();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByTestId("page")).toBeNull();
  });

  it("draws no frame around a workspace route", async () => {
    m.segments = ["events", "new"];
    const { container } = await renderLayout();
    expect(screen.getByTestId("page")).toBeInTheDocument();
    expect(screen.queryByTestId("identity")).toBeNull();
    expect(container.querySelector("[data-community-rail]")).toBeNull();
  });

  describe("identity density", () => {
    const owner: HubMembershipSeed[] = [
      { slug: "mlops", status: "active", role: "owner" },
    ];

    it("is compact on a member's tab page", async () => {
      m.segments = ["insights"];
      await renderLayout(owner);
      expect(m.identityProps.at(-1)?.density).toBe("compact");
    });

    it("is compact on a member's Overview too", async () => {
      await renderLayout(owner);
      expect(m.identityProps.at(-1)?.density).toBe("compact");
    });

    it("is full on a tab page for someone who has not joined", async () => {
      m.segments = ["insights"];
      await renderLayout();
      expect(m.identityProps.at(-1)?.density).toBe("full");
    });
  });
});
