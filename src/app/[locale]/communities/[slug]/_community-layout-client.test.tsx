import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import type { CommunityThemeId } from "@/lib/communities/themes";

type Community = {
  slug: string;
  name: string;
  bannerUrl: string | null;
  bannerAlt?: string | null;
  themeId: CommunityThemeId;
  viewerCanReadContent: boolean;
  viewerMembershipStatus: string | null;
};

const m = vi.hoisted(() => ({
  segments: [] as string[],
  myCommunities: undefined as
    | { slug: string; status: string; role: string }[]
    | undefined,
  community: {
    data: {
      slug: "mlops",
      name: "MLOps",
      bannerUrl: null,
      themeId: "plain",
      viewerCanReadContent: true,
      viewerMembershipStatus: null,
    } as Community | undefined,
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
      getMyCommunities: { useQuery: () => ({ data: m.myCommunities }) },
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
// Next compiles font loaders; the heading faces get plain test classes.
vi.mock("next/font/google", () => {
  const face = ({ variable }: { variable: string }) => ({
    variable: variable.replace(/^--/, ""),
    className: "",
  });
  return {
    Fraunces: face,
    Nunito: face,
    DM_Serif_Display: face,
    Space_Grotesk: face,
  };
});
vi.mock("@/components/communities/community-identity", () => ({
  CommunityIdentity: () => <div data-testid="identity" />,
}));
vi.mock("@/components/communities/community-nav", () => ({
  CommunityNav: () => <nav data-testid="nav" />,
}));
vi.mock("@/components/communities/community-members-only", () => ({
  CommunityMembersOnly: (props: {
    membershipStatus: string | null;
    community: { slug: string };
  }) => (
    <section
      data-testid="members-only"
      data-status={props.membershipStatus ?? "none"}
    />
  ),
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

const readable: Community = {
  slug: "mlops",
  name: "MLOps",
  bannerUrl: null,
  themeId: "plain",
  viewerCanReadContent: true,
  viewerMembershipStatus: null,
};

beforeEach(() => {
  m.segments = [];
  m.myCommunities = undefined;
  m.community = {
    data: { ...readable },
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

  describe("look", () => {
    it("paints the whole frame, rail and page, in the community's look", async () => {
      m.community.data = { ...readable, themeId: "night" };
      const { container } = await renderLayout();
      const scope = container.querySelector("[data-community-theme]");
      expect(scope).toHaveAttribute("data-community-theme", "night");
      expect(scope).toHaveClass("px-4", "py-8", "sm:px-8");
      expect(scope).toContainElement(
        container.querySelector<HTMLElement>("[data-community-rail]"),
      );
      expect(scope).toContainElement(screen.getByTestId("page"));
    });

    it("reaches down to the footer on a short page", async () => {
      // The navbar is h-12 plus its 1px bottom border; the frame fills the
      // rest of the screen, so the look never stops above the footer.
      const { container } = await renderLayout();
      expect(container.querySelector("[data-community-theme]")).toHaveClass(
        "min-h-[calc(100svh-3rem-1px)]",
      );
    });

    it("leaves a workspace route plain", async () => {
      m.community.data = { ...readable, themeId: "night" };
      m.segments = ["events", "new"];
      const { container } = await renderLayout();
      expect(container.querySelector("[data-community-theme]")).toBeNull();
    });

    it("draws the look's cover art on the Overview when there is no banner", async () => {
      m.community.data = { ...readable, themeId: "meadow" };
      const { container } = await renderLayout();
      const cover = container.querySelector("[data-community-cover-art]");
      expect(cover).not.toBeNull();
      const rail = container.querySelector("[data-community-rail]");
      expect(
        cover!.compareDocumentPosition(rail!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("keeps the cover art off the other pages", async () => {
      m.community.data = { ...readable, themeId: "meadow" };
      m.segments = ["forum"];
      const { container } = await renderLayout();
      expect(container.querySelector("[data-community-cover-art]")).toBeNull();
    });
  });

  describe("banner", () => {
    const banner = "https://cdn.example.test/banner.png";

    it("runs across the top of the Overview, above the rail", async () => {
      m.community.data = { ...readable, bannerUrl: banner };
      const { container } = await renderLayout();
      const img = container.querySelector("[data-community-banner]");
      expect(img).toHaveAttribute("src", banner);
      const rail = container.querySelector("[data-community-rail]");
      expect(rail).not.toContainElement(img as HTMLElement);
      expect(
        img!.compareDocumentPosition(rail!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("stays off the other pages, so their content keeps the space", async () => {
      m.community.data = { ...readable, bannerUrl: banner };
      m.segments = ["forum"];
      const { container } = await renderLayout();
      expect(container.querySelector("[data-community-banner]")).toBeNull();
    });

    it("is absent when the community has none", async () => {
      const { container } = await renderLayout();
      expect(container.querySelector("[data-community-banner]")).toBeNull();
    });
  });

  describe("members-only state (ADR-0050)", () => {
    const banner = "https://cdn.example.test/banner.png";

    beforeEach(() => {
      m.community.data = {
        ...readable,
        bannerUrl: banner,
        viewerCanReadContent: false,
      };
    });

    it.each([[[]], [["forum"]], [["members"]], [["gallery"]], [["magazine"]]])(
      "shows banner, identity and the private panel on %j, never the tabs or the page",
      async (segments) => {
        m.segments = segments;
        const { container } = await renderLayout();
        expect(
          container.querySelector("[data-community-banner]"),
        ).toHaveAttribute("src", banner);
        expect(screen.getByTestId("identity")).toBeInTheDocument();
        expect(screen.getByTestId("members-only")).toBeInTheDocument();
        expect(screen.queryByTestId("nav")).toBeNull();
        expect(screen.queryByTestId("page")).toBeNull();
      },
    );

    it("hands the panel the viewer's membership, so it can explain the next step", async () => {
      m.community.data = {
        ...m.community.data!,
        viewerMembershipStatus: "pending_approval",
      };
      await renderLayout([
        {
          slug: "mlops",
          status: "pending_approval",
          role: "member",
        },
      ]);
      expect(screen.getByTestId("members-only")).toHaveAttribute(
        "data-status",
        "pending_approval",
      );
    });

    it("takes the membership from the same answer as the gate, not from fresher memberships", async () => {
      // Just after accepting an invite: the memberships refetched first and
      // say active, the community answer still says invited and unreadable.
      // An active member who may not read is a lapsed payment, so mixing
      // the two would flash the wrong message.
      m.community.data = {
        ...m.community.data!,
        viewerMembershipStatus: "invited",
      };
      m.myCommunities = [{ slug: "mlops", status: "active", role: "member" }];
      await renderLayout([
        { slug: "mlops", status: "invited", role: "member" },
      ]);
      expect(screen.getByTestId("members-only")).toHaveAttribute(
        "data-status",
        "invited",
      );
    });

    it("keeps the paid offers reachable, still without the tabs", async () => {
      m.segments = ["offers"];
      await renderLayout();
      expect(screen.getByTestId("page")).toBeInTheDocument();
      expect(screen.queryByTestId("members-only")).toBeNull();
      expect(screen.queryByTestId("nav")).toBeNull();
    });

    it("leaves a workspace route to its own gate", async () => {
      m.segments = ["events", "new"];
      await renderLayout();
      expect(screen.getByTestId("page")).toBeInTheDocument();
      expect(screen.queryByTestId("members-only")).toBeNull();
    });
  });
});
