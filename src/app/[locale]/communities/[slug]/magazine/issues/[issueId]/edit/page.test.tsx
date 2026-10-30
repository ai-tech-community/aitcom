// The issue builder page gates before it renders (Gate-Before-Fail): guests
// go to sign-in, everyone but an editor of the issue's community gets 404.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/components/magazines/test-intl";

import en from "../../../../../../../../../messages/en.json";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  allowed: false,
  gateCalls: [] as unknown[],
}));

// Next compiles font loaders; route unit tests provide their generated classes.
vi.mock("next/font/google", () => {
  const font = ({ variable }: { variable: string }) => ({
    variable: variable.replace(/^--/, ""),
  });
  return { Italiana: font, Bodoni_Moda: font, Cormorant_Garamond: font };
});
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
vi.mock("@/server/magazines/issue-editing", () => ({
  canEditIssueAt: async (_deps: unknown, opts: unknown) => {
    state.gateCalls.push(opts);
    return state.allowed;
  },
}));
vi.mock("@/components/magazines/editor/builder/issue-builder", () => ({
  IssueBuilder: ({
    communitySlug,
    issueId,
  }: {
    communitySlug: string;
    issueId: number;
  }) => (
    <div
      data-testid="builder"
      data-community={communitySlug}
      data-issue={issueId}
    />
  ),
}));
vi.mock("@/trpc/server", () => ({
  api: {
    magazines: {
      getIssueForEditing: { prefetch: async () => undefined },
    },
  },
  HydrateClient: ({ children }: { children: React.ReactNode }) => children,
}));

import IssueBuilderPage, { dynamic, generateMetadata } from "./page";

const params = (issueId = "5") =>
  Promise.resolve({ locale: "en", slug: "night-owls", issueId });

beforeEach(() => {
  state.session = { user: { id: "editor-1" } };
  state.allowed = true;
  state.gateCalls = [];
});

describe("issue builder page", () => {
  it("is rendered per request and never indexed", async () => {
    expect(dynamic).toBe("force-dynamic");
    const metadata = await generateMetadata({ params: params() });
    expect(metadata).toMatchObject({
      title: "Edit issue",
      robots: { index: false },
    });
  });

  it("sends guests to sign in and back", async () => {
    state.session = null;
    await expect(IssueBuilderPage({ params: params() })).rejects.toThrow(
      "NEXT_REDIRECT /en/auth/signin?redirect=/en/communities/night-owls/magazine/issues/5/edit",
    );
    expect(state.gateCalls).toEqual([]);
  });

  it("is a 404 for anyone who does not edit this issue", async () => {
    state.allowed = false;
    await expect(IssueBuilderPage({ params: params() })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(state.gateCalls).toEqual([
      { communitySlug: "night-owls", issueId: 5, viewerId: "editor-1" },
    ]);
  });

  it("is a 404 for an issue id that is not a number", async () => {
    await expect(IssueBuilderPage({ params: params("abc") })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(IssueBuilderPage({ params: params("5.5") })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(state.gateCalls).toEqual([]);
  });

  it("renders the builder for an editor", async () => {
    const page = await IssueBuilderPage({ params: params() });
    renderWithIntl(page);
    const builder = screen.getByTestId("builder");
    expect(builder).toHaveAttribute("data-community", "night-owls");
    expect(builder).toHaveAttribute("data-issue", "5");
    expect(builder.parentElement).toHaveClass(
      "font-magazine-italiana",
      "font-magazine-bodoni",
      "font-magazine-cormorant",
    );
  });
});
