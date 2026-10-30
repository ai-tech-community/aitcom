import { screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/magazines/test-intl";
import type { MagazineDesk } from "@/server/magazines/desk";
import { standingOf } from "@/server/magazines/editorship";
import en from "../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  desk: null as MagazineDesk | null,
  gateCalls: [] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
}));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => state.session,
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/desk", () => ({
  loadMagazineDesk: async (_deps: unknown, opts: unknown) => {
    state.gateCalls.push(opts);
    return state.desk;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: ({ href, locale }: { href: string; locale: string }) => {
    throw new Error(`NEXT_REDIRECT /${locale}${href}`);
  },
}));
vi.mock("@/components/magazines/editor/team/magazine-team", () => ({
  MagazineTeam: ({ slug }: { slug: string }) => (
    <div data-testid="team" data-slug={slug} />
  ),
}));
vi.mock("@/components/magazines/editor/magazine-settings-form", () => ({
  MagazineSettingsForm: ({ slug }: { slug: string }) => (
    <div data-testid="settings" data-slug={slug} />
  ),
}));

import Page, { dynamic, generateMetadata } from "./page";

const params = () => Promise.resolve({ locale: "en", slug: "night-owls" });

beforeEach(() => {
  state.session = { user: { id: "viewer-1" } };
  state.gateCalls = [];
  state.desk = {
    community: {
      id: "c1",
      slug: "night-owls",
      name: "Night Owls",
      isListedInDirectory: true,
    },
    magazine: {
      id: 42,
      name: "The Gazette",
      slug: "gazette",
      communityId: "c1",
      createdBy: "owner",
      updatedAt: "2026-10-27",
      createdAt: "2026-10-27",
    },
    standing: standingOf("owner", null),
  };
});

describe("magazine team page", () => {
  it("is rendered per request and never indexed", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(await generateMetadata({ params: params() })).toMatchObject({
      title: "Magazine team",
      robots: { index: false },
    });
  });

  it("answers 404 to editors and contributors", async () => {
    for (const role of ["editor", "contributor"] as const) {
      state.desk!.standing = standingOf("member", role);
      await expect(Page({ params: params() })).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
    }
  });

  it("answers 404 when the community is missing or the viewer has no standing", async () => {
    state.desk!.standing = standingOf(null, null);
    await expect(Page({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    state.desk = null;
    await expect(Page({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("opens for owners, admins and an appointed editor-in-chief", async () => {
    for (const standing of [
      standingOf("owner", null),
      standingOf("admin", null),
      standingOf("member", "editor_in_chief"),
    ]) {
      state.desk!.standing = standing;
      const { unmount } = renderWithIntl(await Page({ params: params() }));
      expect(screen.getByTestId("team")).toHaveAttribute(
        "data-slug",
        "night-owls",
      );
      expect(
        screen.getByRole("link", { name: "Back to the Magazine tab" }),
      ).toHaveAttribute("href", "/communities/night-owls/magazine");
      expect(
        screen.getByText(
          "Choose who writes for and edits The Gazette. Owners and admins of the community always run it.",
        ),
      ).toBeVisible();
      unmount();
    }
    expect(state.gateCalls).toEqual(
      Array.from({ length: 3 }, () => ({
        communitySlug: "night-owls",
        viewerId: "viewer-1",
      })),
    );
  });

  it("sends guests to sign in", async () => {
    state.session = null;
    await expect(Page({ params: params() })).rejects.toThrow(
      "NEXT_REDIRECT /en/auth/signin?redirect=/en/communities/night-owls/magazine/team",
    );
    expect(state.gateCalls).toEqual([]);
  });
  it("answers 404 before a magazine exists", async () => {
    state.desk!.magazine = null;
    await expect(Page({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
