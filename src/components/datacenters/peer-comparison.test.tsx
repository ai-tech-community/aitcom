import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { formatFacilityMw } from "@/lib/investigations/facility-capacity";
import { PeerComparison } from "./peer-comparison";

const colossus = {
  country: "US",
  peerCount: 166,
  thisFacility: {
    currentMw: 250,
    plannedMw: 1000,
    lagDays: null,
    supplierCount: 8,
    aiDedicated: true,
  },
  countryStats: {
    medianMw: 26,
    p75Mw: 100,
    p95Mw: 1800,
    medianLagDays: null,
    aiSharePct: 40,
    medianSuppliers: 0,
    p75Suppliers: 0,
  },
};

describe("<PeerComparison>", () => {
  it("labels operating and planned capacity instead of showing their sum", () => {
    render(<PeerComparison data={colossus} />);

    expect(screen.getByText("Current capacity")).toBeTruthy();
    expect(screen.getByText(formatFacilityMw(250))).toBeTruthy();
    expect(screen.getByText("Planned capacity")).toBeTruthy();
    expect(screen.getByText(formatFacilityMw(1000))).toBeTruthy();
    expect(screen.queryByText(formatFacilityMw(1250))).toBeNull();
    expect(screen.queryByText("1,250")).toBeNull();
    expect(screen.queryByText("1250")).toBeNull();
  });

  it("omits the planned line when the record has no planned capacity", () => {
    render(
      <PeerComparison
        data={{
          ...colossus,
          thisFacility: { ...colossus.thisFacility, plannedMw: null },
        }}
      />,
    );

    expect(screen.getByText(formatFacilityMw(250))).toBeTruthy();
    expect(screen.queryByText("Planned capacity")).toBeNull();
  });
});
