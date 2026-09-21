import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StartupsRolePage } from "./startups-role-page";
import { StartupsRoleDescription } from "./startups-role-description";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
    },
  },
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

const t = (key: string) => key;

const ROLE: StartupRolePublic = {
  id: "1",
  startupId: "a",
  startupSlug: "fixture-co",
  startupName: "Fixture Co",
  startupLogoUrl: null,
  slug: "fixture-co-staff-engineer",
  title: "Staff Engineer",
  location: "Toronto, Canada",
  workType: null,
  sourceUrl: "https://fixture.example/careers/staff",
  applyUrl: null,
  descriptionText: "Build the product.",
  fetchedAt: "2026-09-20T00:00:00.000Z",
  board: "html",
  status: "open",
};

describe("StartupsRoleDescription", () => {
  it("renders sourced headings and bullets as article sections", () => {
    const { container } = render(
      <StartupsRoleDescription
        text={`About the role
Build the product.

Requirements:
- 5 years shipping TypeScript
- English`}
      />,
    );
    const posting = container.querySelector("[data-startup-role-description]");
    expect(posting?.tagName).toBe("ARTICLE");
    expect(posting?.className.split(/\s+/)).toContain("max-w-prose");
    expect(posting?.className).not.toMatch(/whitespace-pre-wrap/);
    expect(
      screen.getByRole("heading", { level: 2, name: "About the role" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(posting?.textContent).toContain("5 years shipping TypeScript");
  });
});

describe("StartupsRolePage posting", () => {
  it("keeps a one-line snapshot as readable body copy", () => {
    const { container } = render(
      <StartupsRolePage locale="en" t={t} role={ROLE} />,
    );
    expect(
      container.querySelector("[data-startup-role-description]")?.textContent,
    ).toBe("Build the product.");
  });
});
