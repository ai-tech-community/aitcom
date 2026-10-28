// The issue page answers 404 when the read model does, and only an issue
// anyone may read (its resolver outsider reach, Decision 9) is indexed.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import { issuePage } from "@/components/magazines/test-fixtures";
import type { IssuePageData } from "@/server/magazines/reading";

const state = vi.hoisted(() => ({
  data: null as IssuePageData | null,
  calls: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
  getLocale: async () => "en",
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => ({ user: { id: "viewer-1" } }),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/reading", () => ({
  loadIssuePage: async (_deps: unknown, opts: unknown) => {
    state.calls.push(opts);
    return state.data;
  },
}));

import IssuePage, { dynamic, generateMetadata } from "./page";

const params = Promise.resolve({
  locale: "en",
  magazineSlug: "agents-weekly",
  issueSlug: "issue-4",
});

beforeEach(() => {
  state.data = null;
  state.calls = [];
});

describe("issue page", () => {
  it("hands the server's absolute canonical URL to sharing", async () => {
    state.data = issuePage();
    const page = await IssuePage({ params });
    const metadata = await generateMetadata({ params });
    expect(page.props.url).toBe(metadata.alternates?.canonical);
    expect(page.props.url).toMatch(
      /^https:\/\/.*\/en\/magazines\/agents-weekly\/issue-4$/,
    );
  });

  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is a 404 with empty metadata when the read model answers null", async () => {
    await expect(IssuePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await generateMetadata({ params })).toEqual({});
    expect(state.calls[0]).toEqual({
      magazineSlug: "agents-weekly",
      issueSlug: "issue-4",
      viewerId: "viewer-1",
      locale: "en",
    });
  });

  it("indexes a published issue that is effectively public", async () => {
    state.data = issuePage();
    const meta = await generateMetadata({ params });
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe(
      "The month agents learned to say no · Agents Weekly",
    );
    expect(meta.description).toBe("A monthly magazine about agents that work.");
    expect(meta.alternates?.canonical).toMatch(
      /\/en\/magazines\/agents-weekly\/issue-4$/,
    );
  });

  it("indexes a preview issue using the resolver's outsider reach", async () => {
    state.data = issuePage({
      access: "teaser",
      issue: {
        visibility: "teaser",
        effectiveVisibility: "teaser",
        outsiderReach: "teaser",
      },
    });
    expect((await generateMetadata({ params })).robots).toBeUndefined();
  });

  it("keeps an unconfirmed public issue in an unlisted community out of search", async () => {
    state.data = issuePage({
      issue: {
        visibility: "public",
        effectiveVisibility: "members",
        outsiderReach: "none",
      },
    });
    expect((await generateMetadata({ params })).robots).toEqual({
      index: false,
    });
  });

  it("keeps members-only issues and drafts out of search", async () => {
    state.data = issuePage({
      issue: {
        visibility: "members",
        effectiveVisibility: "members",
        outsiderReach: "none",
      },
    });
    expect((await generateMetadata({ params })).robots).toEqual({
      index: false,
    });

    state.data = issuePage({
      access: "editor",
      issue: { status: "draft", publishedAt: null, outsiderReach: "none" },
    });
    expect((await generateMetadata({ params })).robots).toEqual({
      index: false,
    });
  });

  it("keeps a staff-hidden magazine out of search while the page still opens", async () => {
    state.data = issuePage();
    state.data.magazine.staffHidden = true;
    expect((await generateMetadata({ params })).robots).toEqual({
      index: false,
    });
    await expect(IssuePage({ params })).resolves.toBeTruthy();
  });

  it("a public or preview issue points its share card at its own image", async () => {
    for (const outsiderReach of ["full", "teaser"] as const) {
      state.data = issuePage({
        issue: {
          outsiderReach,
          coverImageUrl: "https://cdn.example.com/cover.jpg",
        },
      });
      const meta = await generateMetadata({ params });
      expect(meta.openGraph?.images).toEqual([
        "/en/og/magazine/agents-weekly/issue-4",
      ]);
      expect(meta.twitter?.images).toEqual([
        "/en/og/magazine/agents-weekly/issue-4",
      ]);
    }
  });

  it("a members-only issue never points at a share image", async () => {
    state.data = issuePage({
      issue: {
        outsiderReach: "none",
        coverImageUrl: "https://cdn.example.com/cover.jpg",
      },
    });
    expect((await generateMetadata({ params })).openGraph?.images).toEqual([
      "https://cdn.example.com/cover.jpg",
    ]);
    state.data = issuePage({
      issue: { outsiderReach: "none", coverImageUrl: null },
    });
    expect(
      JSON.stringify((await generateMetadata({ params })).openGraph?.images),
    ).not.toContain("/og/magazine/");
  });
});
