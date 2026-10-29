import { describe, expect, it, vi } from "vitest";

const publishDatacenterFacility = vi.hoisted(() => vi.fn());

vi.mock("@/server/datacenters/publish-facility", () => ({
  publishDatacenterFacility,
}));

import { publishFacilityBeforeChange } from "./DatacenterFacilities";

const published = {
  ok: true as const,
  inserted: false,
  slug: "fairwater",
  path: "/investigations/datacenters/fairwater",
  url: "https://www.aitcommunity.org/en/investigations/datacenters/fairwater",
  sourceUrl: "https://example.com/filing",
  checkedAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-30T15:04:00.000Z",
  status: "operational" as const,
};

describe("publishFacilityBeforeChange", () => {
  it("publishes the merged facility and stores the live slug", async () => {
    publishDatacenterFacility.mockResolvedValue(published);
    const result = await publishFacilityBeforeChange({
      data: { capacityMw: 12 },
      originalDoc: {
        name: "Fairwater",
        operator: "Microsoft",
        slug: "fairwater",
        sourceUrl: "https://example.com/filing",
        checkedAt: "2026-10-28T00:00:00.000Z",
      },
    } as never);
    expect(publishDatacenterFacility).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Fairwater",
        operator: "Microsoft",
        slug: "fairwater",
        capacityMw: 12,
        sourceUrl: "https://example.com/filing",
      }),
    );
    expect(result).toMatchObject({
      slug: "fairwater",
      sourceUrl: "https://example.com/filing",
      checkedAt: "2026-10-28T00:00:00.000Z",
    });
  });

  it("refuses a save that has no https source", async () => {
    publishDatacenterFacility.mockResolvedValue({
      ok: false,
      error: "source_url must be an https URL.",
    });
    await expect(
      publishFacilityBeforeChange({ data: { name: "Fairwater" } } as never),
    ).rejects.toThrow("source_url must be an https URL.");
  });
});
