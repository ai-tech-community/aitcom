import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  profile: null as unknown,
  viewerId: null as string | null,
  profileCalls: 0,
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (
    opts: string | { locale?: string; namespace?: string },
  ) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: (typeof opts === "string" ? opts : opts.namespace) as never,
    }),
  getLocale: async () => "en",
}));

vi.mock("@/trpc/server", () => ({
  api: {
    members: {
      getPublicProfile: async () => {
        state.profileCalls += 1;
        return state.profile;
      },
    },
    badges: { rarity: async () => ({ members: 10, badges: [] }) },
  },
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () =>
    state.viewerId ? { user: { id: state.viewerId } } : null,
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/members/agent-profile", () => ({
  loadAgentPageAccess: async () => null,
  loadAgentProfilePage: async () => null,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { badgePageMetadata } from "@/server/members/profile-page";

import MemberBadgePage, { generateMetadata } from "./page";

function profile({
  audience = "visitor",
  reach = { kind: "public" },
  badges = [
    {
      slug: "article_author",
      earnedAt: new Date("2026-03-03T12:00:00Z"),
    },
  ],
}: {
  audience?: "owner" | "visitor";
  reach?: { kind: string; reason?: string };
  badges?: { slug: string; earnedAt: Date }[];
} = {}) {
  return {
    profile: { userId: "u1", displayName: "Ada Lovelace" },
    audience,
    reach,
    user: { image: null, avatarUrl: null },
    badges,
    showcase: { slugs: [], source: "rarest" },
  };
}

const params = (slug: string) =>
  Promise.resolve({ id: "u1", slug, locale: "en" });

async function renderPage(slug: string) {
  const ui = await MemberBadgePage({ params: params(slug) });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.profile = null;
  state.viewerId = null;
  state.profileCalls = 0;
});

describe("badge share page", () => {
  it("is a 404 for a visitor when the profile is not public (the gate returns nothing)", async () => {
    state.profile = null;
    await expect(renderPage("article_author")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(
      await generateMetadata({ params: params("article_author") }),
    ).toEqual({});
  });

  it("is a 404 for a badge the member does not hold, or one outside the catalog", async () => {
    state.profile = profile();
    await expect(renderPage("veteran")).rejects.toThrow("NEXT_NOT_FOUND");
    state.profileCalls = 0;
    await expect(renderPage("speaker")).rejects.toThrow("NEXT_NOT_FOUND");
    // Not a catalog slug: the profile is not even read.
    expect(state.profileCalls).toBe(0);
  });

  it("shows the badge, its facts and who earned it, with a join step for guests", async () => {
    state.profile = profile();
    await renderPage("article_author");
    expect(
      screen.getByRole("heading", { level: 2, name: "Writer I" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Writer · tier I")).toBeInTheDocument();
    expect(
      screen.getByText("Published 1 approved article"),
    ).toBeInTheDocument();
    expect(screen.getByText("Earned March 3, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ada Lovelace/ })).toHaveAttribute(
      "href",
      "/members/u1",
    );
    expect(
      screen.getByRole("link", { name: "Join AIT Community" }),
    ).toHaveAttribute("href", "/join");
  });

  it("points a signed-in visitor to their own badges", async () => {
    state.profile = profile();
    state.viewerId = "u2";
    await renderPage("article_author");
    expect(
      screen.getByRole("link", { name: "See your badges" }),
    ).toHaveAttribute("href", "/members/u2/badges");
    expect(
      screen.queryByRole("link", { name: "Join AIT Community" }),
    ).toBeNull();
  });

  it("lets the owner see it on a private profile, never indexed", async () => {
    state.profile = profile({
      audience: "owner",
      reach: { kind: "ownerOnly", reason: "private" },
    });
    state.viewerId = "u1";
    await renderPage("article_author");
    // The profile frame (layout) shows the owner-only notice for this reach.
    expect(
      screen.getByRole("link", { name: "Back to your badges" }),
    ).toHaveAttribute("href", "/members/u1/badges");
    const meta = await badgePageMetadata({
      userId: "u1",
      slug: "article_author",
      locale: "en",
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("has a share title, the badge description and its own Open Graph image", async () => {
    state.profile = profile();
    const meta = await generateMetadata({ params: params("article_author") });
    expect(meta.title).toBe("Ada Lovelace earned Writer I");
    expect(meta.description).toBe("Published 1 approved article");
    expect(meta.openGraph?.images).toEqual([
      "/en/members/u1/badges/article_author/image",
    ]);
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      images: ["/en/members/u1/badges/article_author/image"],
    });
    expect(meta.alternates?.canonical).toMatch(
      /\/en\/members\/u1\/badges\/article_author$/,
    );
    expect(meta.robots).toBeUndefined();
  });
});
