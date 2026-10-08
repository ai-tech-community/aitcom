import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import nl from "../../../../../messages/nl.json";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

const state = vi.hoisted(() => ({
  locale: "en" as "en" | "nl",
  role: null as StartupRolePublic | null,
}));

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => state.locale,
  getTranslations: async (
    namespace: string | { locale?: string; namespace?: string },
  ) =>
    createTranslator({
      locale: state.locale,
      messages: state.locale === "nl" ? nl : en,
      namespace: (typeof namespace === "string"
        ? namespace
        : namespace.namespace) as never,
    }),
}));

vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => null,
}));

vi.mock("@/server/startups/queries", () => ({
  findPublicStartupRoleBySlug: async () => state.role,
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

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ startups: { getMyCv: { invalidate: vi.fn() } } }),
    startups: {
      getMyCv: { useQuery: () => ({ data: null, isPending: false }) },
      upsertMyCv: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteMyCv: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getMyRoleApplication: {
        useQuery: () => ({ data: { applying: false }, isPending: false }),
      },
      setMyRoleApplication: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

import JobsRoleRoute, { generateMetadata } from "./page";

function role(status: "open" | "closed"): StartupRolePublic {
  return {
    id: "role-1",
    startupId: "fixture-one",
    startupSlug: "fixture-co",
    startupName: "Fixture Co",
    startupLogoUrl: null,
    slug: "fixture-co-staff-engineer",
    title: "Staff Engineer",
    location: "Toronto, Canada",
    workType: "Full-time",
    sourceUrl: "https://fixture.example/careers/staff",
    applyUrl: null,
    descriptionText: "Build the product.",
    fetchedAt: "2026-09-20T00:00:00.000Z",
    postedAt: "2026-03-01T12:00:00.000Z",
    board: "html",
    status,
  };
}

const params = () => Promise.resolve({ roleSlug: "fixture-co-staff-engineer" });

function jobPosting(container: HTMLElement) {
  const raw = container.querySelector(
    "script[type='application/ld+json']",
  )?.textContent;
  return raw
    ? (JSON.parse(raw) as { "@type"?: string; validThrough?: string })
    : null;
}

beforeEach(() => {
  state.locale = "en";
  state.role = null;
});

describe("closed startup role page", () => {
  it.each(["en", "nl"] as const)(
    "is noindex, follow and has no JobPosting in %s",
    async (locale) => {
      state.locale = locale;
      state.role = role("closed");
      const ui = await JobsRoleRoute({ params: params() });
      const { container } = render(ui);
      const closed =
        locale === "nl" ? "Deze rol is gesloten" : "This role is closed";
      const back = locale === "nl" ? /Open posities/ : /Open positions/;

      expect(screen.getByText(closed)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: back })).toHaveAttribute(
        "href",
        "/jobs",
      );
      expect(jobPosting(container)).toBeNull();

      const meta = await generateMetadata({ params: params() });
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates?.languages).toMatchObject({
        en: expect.stringContaining("/en/jobs/fixture-co-staff-engineer"),
        nl: expect.stringContaining("/nl/jobs/fixture-co-staff-engineer"),
      });
    },
  );

  it("keeps an open role indexable and emits JobPosting", async () => {
    state.role = role("open");
    const ui = await JobsRoleRoute({ params: params() });
    const { container } = render(ui);

    expect(screen.queryByText("This role is closed")).not.toBeInTheDocument();
    expect(jobPosting(container)).toMatchObject({
      "@type": "JobPosting",
    });
    expect(jobPosting(container)).not.toHaveProperty("validThrough");

    const meta = await generateMetadata({ params: params() });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});
