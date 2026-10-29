import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const investigationStats = vi.hoisted(() => vi.fn());

vi.mock("@/trpc/server", () => ({
  api: { datacenters: { investigationStats } },
}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/datacenters/mission-dialog", () => ({
  MissionDialog: () => null,
}));

import InvestigationsPage, { generateMetadata } from "./page";

const stats = {
  updatedAt: "2026-10-31T08:00:00.000Z",
  totals: {
    facilityCount: 2,
    totalMw: 10,
    plannedMw: 5,
    countries: 1,
    aiDedicated: 1,
  },
  supplierTotals: { linkCount: 3, supplierCount: 2 },
};

beforeEach(() => {
  investigationStats.mockResolvedValue(stats);
});

describe("investigations hub", () => {
  it("titles the page for datacenters and keeps /investigations", async () => {
    const meta = await generateMetadata();
    expect(meta.title).toBe("AI Datacenter Investigations");
    expect(meta.alternates).toMatchObject({
      canonical: "https://www.aitcommunity.org/en/investigations",
    });
  });

  it("shows the latest facility updated date", async () => {
    render(await InvestigationsPage());
    expect(
      screen.getByRole("heading", { name: "AI Datacenter Investigations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Updated 2026.10.31")).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-10-31",
    );
  });
});
