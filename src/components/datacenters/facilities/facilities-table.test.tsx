import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  Link: ({
    href,
    children,
    scroll: _scroll,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
    scroll?: boolean;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import en from "../../../../messages/en.json";
import { FacilitiesNavigationProvider } from "./facilities-navigation";
import { FacilitiesTable, type FacilityRow } from "./facilities-table";

const t = createTranslator({
  locale: "en",
  messages: en,
  namespace: "datacenterInvestigation",
}) as unknown as (
  key: string,
  values?: Record<string, string | number>,
) => string;

const row = (over: Partial<FacilityRow>): FacilityRow => ({
  id: "1",
  slug: "fairwater",
  name: "Fairwater",
  status: "operational",
  aiDedicated: true,
  verified: true,
  city: "Mount Pleasant",
  region: "Wisconsin",
  country: "US",
  capacityMw: "1200",
  capacityMwPlanned: null,
  primaryPowerSource: "grid-mixed",
  operator: { slug: "microsoft", canonicalName: "Microsoft" },
  supplierCount: 4,
  ...over,
});

function renderTable(query = "status=operational&page=3") {
  return render(
    <FacilitiesNavigationProvider>
      <FacilitiesTable
        rows={[
          row({}),
          row({
            id: "2",
            slug: "tbd",
            name: "Unnamed campus",
            status: "under-construction",
            aiDedicated: false,
            verified: false,
            capacityMw: null,
            primaryPowerSource: null,
            supplierCount: 0,
          }),
        ]}
        sort="capacity"
        dir="desc"
        query={query}
        locale="en"
        t={t}
      />
    </FacilitiesNavigationProvider>,
  );
}

describe("<FacilitiesTable>", () => {
  it("announces the active sort on its column header only", () => {
    renderTable();
    const headers = screen.getAllByRole("columnheader");
    const sorted = headers.filter((h) => h.hasAttribute("aria-sort"));
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.textContent).toBe("MW");
    expect(sorted[0]!.getAttribute("aria-sort")).toBe("descending");
    expect(screen.getByText(/sorted by MW, descending/)).toBeTruthy();
  });

  it("links each header to its sorted view, keeping filters and resetting the page", () => {
    renderTable();
    expect(
      screen.getByRole("link", { name: "Facility" }).getAttribute("href"),
    ).toBe("/investigations/datacenters?status=operational&sort=name&dir=asc");
    // Toggling the default sort back to ascending.
    expect(screen.getByRole("link", { name: "MW" }).getAttribute("href")).toBe(
      "/investigations/datacenters?status=operational&sort=capacity&dir=asc",
    );
  });

  it("routes a plain header click through the router without jumping to the top", () => {
    renderTable();
    screen.getByRole("link", { name: "Operator" }).click();
    expect(router.push).toHaveBeenCalledWith(
      "/investigations/datacenters?status=operational&sort=operator&dir=asc",
      { scroll: false },
    );
  });

  it("renders translated status, badges, numbers and missing values", () => {
    renderTable();
    const [first, second] = screen.getAllByRole("row").slice(1);

    const a = within(first!);
    expect(
      a.getByRole("link", { name: "Fairwater" }).getAttribute("href"),
    ).toBe("/investigations/datacenters/fairwater");
    expect(a.getByTitle("AI-dedicated facility")).toBeTruthy();
    expect(a.getByText("Operational")).toBeTruthy();
    expect(a.getByText("1,200")).toBeTruthy();
    expect(a.getByText("Grid (mixed)")).toBeTruthy();
    expect(a.getByTitle("United States").textContent).toBe("US");

    const b = within(second!);
    expect(b.getByText("Unverified")).toBeTruthy();
    expect(b.getByText("Under construction")).toBeTruthy();
    expect(b.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
