import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  articlePage,
  issuePage,
  shelfData,
} from "@/components/magazines/test-fixtures";
import {
  AGENT_READY_META,
  MCP_REGISTRY_META,
  REGISTER_AGENT_META,
} from "@/lib/seo-guides";
import {
  PUBLIC_EVENTS_H1,
  PUBLIC_EVENTS_META,
} from "@/lib/events/public-events";
import { STARTUPS_H1, STARTUPS_META } from "@/lib/investigations/startups";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import nl from "../../messages/nl.json";

const catalogues = { en, fr, nl };

type RoleFixture = {
  id: string;
  startupId: string;
  startupSlug: string;
  startupName: string;
  startupLogoUrl: null;
  slug: string;
  title: string;
  location: string | null;
  workType: string | null;
  sourceUrl: string;
  applyUrl: null;
  descriptionText: string | null;
  fetchedAt: string;
  postedAt: null;
  board: "html";
  status: "open";
};

const recruiterRole: RoleFixture = {
  id: "role-1",
  startupId: "taktile",
  startupSlug: "taktile",
  startupName: "Taktile",
  startupLogoUrl: null,
  slug: "taktile-senior-recruiter-2",
  title: "Senior Recruiter",
  location: "Berlin",
  workType: "Full-time",
  sourceUrl: "https://taktile.example/careers",
  applyUrl: null,
  descriptionText: "a".repeat(200),
  fetchedAt: "2026-09-20T00:00:00.000Z",
  postedAt: null,
  board: "html",
  status: "open",
};

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "fr" | "nl",
  communityDescription: null as string | null,
  role: null as RoleFixture | null,
  shelf: null as ReturnType<typeof shelfData> | null,
  issue: null as ReturnType<typeof issuePage> | null,
  article: null as ReturnType<typeof articlePage> | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: () => null,
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined }),
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async (
    input?: string | { locale?: string; namespace?: string },
  ) => {
    const explicit = typeof input === "object" ? input : undefined;
    const locale = (explicit?.locale ?? state.locale) as "en" | "fr" | "nl";
    const namespace = typeof input === "string" ? input : explicit?.namespace;
    return createTranslator({
      locale,
      messages: catalogues[locale],
      ...(namespace ? { namespace: namespace as never } : {}),
    });
  },
}));

vi.mock("@/server/db", () => ({ db: {} }));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => null,
}));

vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    find: async (args: {
      where?: {
        slug?: { equals?: string };
        and?: Array<{ slug?: { equals?: string } }>;
      };
    }) => {
      const where = args.where;
      const slug =
        where?.slug?.equals ??
        where?.and?.find((clause) => clause.slug?.equals)?.slug?.equals;
      if (!slug) return { docs: [] };
      const title =
        slug === "world-summit-ai-amsterdam-2026"
          ? "World Summit AI Amsterdam 2026"
          : "AE Global Summit 2026";
      return {
        docs: [
          {
            title,
            slug,
            type: "conference",
            date: "2026-10-07",
            endDate: "2026-10-08",
            city: "Amsterdam",
            location: "Taets Art & Event Park",
            format: "in-person",
            summary: null,
            description: null,
            status: "published",
          },
        ],
      };
    },
  }),
}));

vi.mock("@/server/startups/queries", () => ({
  listApprovedPublicStartups: async () => [],
  findApprovedPublicStartupBySlug: async () => ({
    id: "zwo",
    name: "ZWO Astrophotography",
    homepage: "https://zwo.example",
    category: "models",
    sources: [],
    region: null,
    lat: null,
    lng: null,
    country: null,
    stage: null,
    logoUrl: null,
    description: null,
    founders: [],
    investors: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
    listedOn: "2026-01-01",
    slug: "fixture-startup",
    openRoleCount: 0,
  }),
  listOpenStartupRolesForCompany: async () => [],
  listPublicStartupRoles: async () => [],
  matchPublicStartupRoleIds: async () => null,
  findPublicStartupRoleBySlug: async () => state.role,
}));

vi.mock("@/server/news/startup-links", () => ({
  listStartupNewsMentions: async () => [],
}));

vi.mock("@/server/magazines/reading", () => ({
  loadMagazinesHome: async () => ({
    featured: null,
    justPublished: [],
    magazines: [],
    topics: [],
  }),
  loadMagazineShelf: async () => state.shelf,
  loadIssuePage: async () => state.issue,
  loadMagazineArticlePage: async () => state.article,
}));

vi.mock("@/trpc/server", () => ({
  api: {
    communities: {
      getBySlug: async () => ({
        name: "ZWO Astrophotography",
        description: state.communityDescription,
        logoUrl: null,
      }),
      directory: {
        prefetch: async () => undefined,
        prefetchInfinite: async () => undefined,
      },
    },
    spaces: { squareRooms: { prefetch: async () => undefined } },
  },
  HydrateClient: ({ children }: { children: ReactNode }) => children,
}));

// Metadata assertions do not need to execute the font-loading presentation wrapper.
vi.mock("@/components/magazines/reading/magazine-font-scope", () => ({
  MagazineFontScope: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/investigations/startups-profile", () => ({
  StartupsProfilePage: () => null,
}));

vi.mock("@/components/investigations/startups-page", () => ({
  StartupsPage: () => null,
}));

vi.mock("@/components/investigations/startups-jobs-page", () => ({
  StartupsJobsPage: () => null,
}));

vi.mock("@/components/investigations/startups-role-page", () => ({
  StartupsRolePage: () => null,
}));

import { generateMetadata as homeMetadata } from "@/app/[locale]/page";
import { generateMetadata as communitiesMetadata } from "@/app/[locale]/communities/page";
import { generateMetadata as communityMetadata } from "@/app/[locale]/communities/[slug]/page";
import { generateMetadata as eventsMetadata } from "@/app/[locale]/events/page";
import { generateMetadata as eventMetadata } from "@/app/[locale]/events/[slug]/page";
import { generateMetadata as worldSummitMetadata } from "@/app/[locale]/events/world-summit-ai-amsterdam-2026/page";
import { generateMetadata as startupsMetadata } from "@/app/[locale]/startups/page";
import { generateMetadata as startupMetadata } from "@/app/[locale]/startups/[slug]/page";
import { generateMetadata as insightsMetadata } from "@/app/[locale]/startups/insights/page";
import { generateMetadata as jobsMetadata } from "@/app/[locale]/jobs/page";
import { generateMetadata as jobMetadata } from "@/app/[locale]/jobs/[roleSlug]/page";
import { generateMetadata as magazinesMetadata } from "@/app/[locale]/magazines/page";
import { generateMetadata as magazineMetadata } from "@/app/[locale]/magazines/[magazineSlug]/page";
import { generateMetadata as issueMetadata } from "@/app/[locale]/magazines/[magazineSlug]/[issueSlug]/page";
import { generateMetadata as articleMetadata } from "@/app/[locale]/magazines/[magazineSlug]/[issueSlug]/[articleSlug]/page";
import { generateMetadata as registerGuideMetadata } from "@/app/[locale]/guides/register-agent-mcp/page";
import { generateMetadata as registryGuideMetadata } from "@/app/[locale]/guides/mcp-registry-vs-community-hub/page";
import { generateMetadata as agentReadyMetadata } from "@/app/[locale]/guides/agent-ready-community/page";

type MetaCopy = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function copyOf(meta: Metadata): MetaCopy {
  const title =
    typeof meta.title === "string"
      ? meta.title
      : meta.title && typeof meta.title === "object" && "absolute" in meta.title
        ? text(meta.title.absolute)
        : "";
  const og = meta.openGraph;
  const twitter = meta.twitter;
  return {
    title,
    description: text(meta.description),
    ogTitle: og && "title" in og ? text(og.title) : "",
    ogDescription: og && "description" in og ? text(og.description) : "",
    twitterTitle: twitter && "title" in twitter ? text(twitter.title) : "",
    twitterDescription:
      twitter && "description" in twitter ? text(twitter.description) : "",
  };
}

const emptySearch = Promise.resolve({});

type RouteCase = {
  id: string;
  enTitle: string;
  titleDiffers: boolean;
  properNames?: string[];
  load: () => Promise<Metadata>;
};

const routes: RouteCase[] = [
  {
    id: "home",
    enTitle: "AIT Community - Where any community gathers",
    titleDiffers: true,
    load: () => homeMetadata(),
  },
  {
    id: "communities",
    enTitle: "Discover",
    titleDiffers: true,
    load: () => communitiesMetadata(),
  },
  {
    id: "community detail",
    enTitle: "ZWO Astrophotography · AI Tech Community",
    titleDiffers: true,
    properNames: ["ZWO Astrophotography"],
    load: () =>
      communityMetadata({
        params: Promise.resolve({ slug: "zwo", locale: state.locale }),
      }),
  },
  {
    id: "events",
    enTitle: PUBLIC_EVENTS_H1,
    titleDiffers: true,
    load: () => eventsMetadata({ searchParams: emptySearch }),
  },
  {
    id: "event detail",
    enTitle: "AE Global Summit 2026",
    titleDiffers: false,
    properNames: ["AE Global Summit 2026"],
    load: () =>
      eventMetadata({
        params: Promise.resolve({ slug: "ae-global-summit-2026" }),
      }),
  },
  {
    id: "world summit",
    enTitle:
      "World Summit AI Amsterdam 2026 on AIT Community (and how to join)",
    titleDiffers: true,
    properNames: ["World Summit AI Amsterdam 2026"],
    load: () => worldSummitMetadata(),
  },
  {
    id: "startups",
    enTitle: STARTUPS_H1,
    titleDiffers: true,
    load: () => startupsMetadata({ searchParams: emptySearch }),
  },
  {
    id: "startup detail",
    enTitle: "ZWO Astrophotography",
    titleDiffers: false,
    properNames: ["ZWO Astrophotography"],
    load: () =>
      startupMetadata({ params: Promise.resolve({ slug: "fixture-startup" }) }),
  },
  {
    id: "startup insights",
    enTitle: "Startup insights",
    titleDiffers: true,
    load: () => insightsMetadata(),
  },
  {
    id: "jobs",
    enTitle: "Open positions",
    titleDiffers: true,
    load: () => jobsMetadata({ searchParams: emptySearch }),
  },
  {
    id: "job detail",
    enTitle: "Senior Recruiter — Taktile",
    titleDiffers: false,
    properNames: ["Senior Recruiter", "Taktile"],
    load: () =>
      jobMetadata({
        params: Promise.resolve({ roleSlug: "taktile-senior-recruiter-2" }),
      }),
  },
  {
    id: "magazines",
    enTitle: "Magazines",
    titleDiffers: false,
    load: () =>
      magazinesMetadata({
        params: Promise.resolve({ locale: state.locale }),
      }),
  },
  {
    id: "magazine shelf",
    enTitle: "Agents Weekly",
    titleDiffers: false,
    properNames: ["Agents Weekly"],
    load: () =>
      magazineMetadata({
        params: Promise.resolve({
          locale: state.locale,
          magazineSlug: "agents-weekly",
        }),
      }),
  },
  {
    id: "magazine issue",
    enTitle: "The month agents learned to say no · Agents Weekly",
    titleDiffers: false,
    properNames: ["The month agents learned to say no", "Agents Weekly"],
    load: () =>
      issueMetadata({
        params: Promise.resolve({
          locale: state.locale,
          magazineSlug: "agents-weekly",
          issueSlug: "issue-4",
        }),
      }),
  },
  {
    id: "magazine article",
    enTitle: "Agents that know when to stop · Agents Weekly",
    titleDiffers: false,
    properNames: ["Agents that know when to stop", "Agents Weekly"],
    load: () =>
      articleMetadata({
        params: Promise.resolve({
          locale: state.locale,
          magazineSlug: "agents-weekly",
          issueSlug: "issue-4",
          articleSlug: "agents-that-know-when-to-stop",
        }),
      }),
  },
  {
    id: "register agent guide",
    enTitle: en.guidesRegisterAgentMcp.title,
    titleDiffers: true,
    load: () => registerGuideMetadata(),
  },
  {
    id: "mcp registry guide",
    enTitle: en.guidesMcpRegistryVsHub.title,
    titleDiffers: true,
    load: () => registryGuideMetadata(),
  },
  {
    id: "agent-ready guide",
    enTitle: en.guidesAgentReadyCommunity.title,
    titleDiffers: true,
    load: () => agentReadyMetadata(),
  },
];

function message(catalogue: object, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, catalogue);
  return typeof value === "string" ? value : undefined;
}

beforeEach(() => {
  state.locale = "en";
  state.communityDescription = null;
  state.role = recruiterRole;
  const shelf = shelfData();
  shelf.magazine = { ...shelf.magazine, description: null };
  state.shelf = shelf;
  const issue = issuePage();
  issue.magazine = { ...issue.magazine, description: null };
  state.issue = issue;
  state.article = articlePage();
});

describe("French route metadata", () => {
  it("keeps the English catalogue equal to the existing meta constants", () => {
    expect(en.hero.description).toBe(
      "A sports club, an expat group, a local business. You bring the people. AI takes the busywork.",
    );
    expect(en.publicEvents.title).toBe(PUBLIC_EVENTS_H1);
    expect(en.events.listingMemberLead).toBe(PUBLIC_EVENTS_META);
    expect(en.investigationsStartups.title).toBe(STARTUPS_H1);
    expect(message(en, "investigationsStartups.metaDescription")).toBe(
      STARTUPS_META,
    );
    expect(message(en, "investigationsStartups.jobsMeta")).toBe(
      "Open positions at listed companies, each linked to the original posting.",
    );
    expect(message(en, "guidesRegisterAgentMcp.metaDescription")).toBe(
      REGISTER_AGENT_META,
    );
    expect(message(en, "guidesMcpRegistryVsHub.metaDescription")).toBe(
      MCP_REGISTRY_META,
    );
    expect(message(en, "guidesAgentReadyCommunity.metaDescription")).toBe(
      AGENT_READY_META,
    );
    expect(message(nl, "investigationsStartups.metaDescription")).not.toBe(
      STARTUPS_META,
    );
    expect(message(fr, "investigationsStartups.jobsMeta")).not.toBe(
      message(en, "investigationsStartups.jobsMeta"),
    );
  });

  it.each(routes)("$id /fr metadata differs from /en", async (route) => {
    state.locale = "en";
    const english = copyOf(await route.load());
    state.locale = "fr";
    const french = copyOf(await route.load());

    expect(english.title, route.id).toBe(route.enTitle);
    expect(french, route.id).not.toEqual(english);
    if (route.titleDiffers) {
      expect(french.title, route.id).not.toBe(english.title);
    } else {
      expect(french.title, route.id).toBe(english.title);
    }
    for (const name of route.properNames ?? []) {
      expect(french.title + french.description, route.id).toContain(name);
    }
    expect(french.ogTitle, route.id).toBe(french.title);
    expect(french.ogDescription, route.id).toBe(french.description);
    expect(french.twitterTitle, route.id).toBe(french.title);
    expect(french.twitterDescription, route.id).toBe(french.description);
    expect(english.ogTitle, route.id).toBe(english.title);
    expect(english.ogDescription, route.id).toBe(english.description);
  });

  it("keeps a community's own description and translates the fallback", async () => {
    state.communityDescription = "A club for astrophotography.";
    state.locale = "en";
    const english = copyOf(
      await communityMetadata({
        params: Promise.resolve({ slug: "zwo", locale: "en" }),
      }),
    );
    state.locale = "fr";
    const french = copyOf(
      await communityMetadata({
        params: Promise.resolve({ slug: "zwo", locale: "fr" }),
      }),
    );
    expect(french.description).toBe("A club for astrophotography.");
    expect(english.description).toBe(french.description);
    expect(french.title).toContain("ZWO Astrophotography");
    expect(french.title).not.toBe(english.title);
  });

  it("translates a job without a location and leaves the role title", async () => {
    state.role = {
      ...recruiterRole,
      id: "role-2",
      startupId: "floot",
      startupSlug: "floot",
      startupName: "Floot",
      slug: "floot-founding-full-stack-engineer",
      title: "Founding Full Stack Engineer",
      location: null,
      workType: null,
      descriptionText: null,
      sourceUrl: "https://floot.example/careers",
    };
    state.locale = "fr";
    const french = copyOf(
      await jobMetadata({
        params: Promise.resolve({
          roleSlug: "floot-founding-full-stack-engineer",
        }),
      }),
    );
    expect(french.title).toBe("Founding Full Stack Engineer — Floot");
    expect(french.description).toContain("Founding Full Stack Engineer");
    expect(french.description).toContain("Floot");
    expect(french.description).not.toMatch(/Sourced from the company/);
  });
});
