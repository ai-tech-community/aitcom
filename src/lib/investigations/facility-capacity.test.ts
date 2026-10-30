import { describe, expect, it } from "vitest";

import { SHOWCASE } from "@/scripts/seed-data/showcase";
import {
  formatFacilityMw,
  peerComparableMw,
  readFacilityCapacity,
} from "./facility-capacity";

describe("readFacilityCapacity", () => {
  it("keeps Colossus Memphis operating and planned capacity as separate fields", () => {
    const record = SHOWCASE.find((d) => d.slug === "xai-colossus-memphis");
    expect(record).toMatchObject({
      capacityMw: 250,
      capacityMwPlanned: 1000,
      sources: [{ url: "https://x.ai/blog/colossus", type: "operator" }],
    });

    const capacity = readFacilityCapacity(
      record?.capacityMw,
      record?.capacityMwPlanned,
    );

    expect(capacity).toEqual({ currentMw: 250, plannedMw: 1000 });
    expect(peerComparableMw(capacity)).toBe(250);
    expect(formatFacilityMw(capacity.currentMw)).not.toContain("1,250");
    expect(formatFacilityMw(capacity.currentMw)).not.toContain("1250");
  });

  it("does not add a planned total that equals operating capacity", () => {
    const capacity = readFacilityCapacity(704, 704);
    expect(capacity).toEqual({ currentMw: 704, plannedMw: 704 });
    expect(peerComparableMw(capacity)).toBe(704);
  });

  it("leaves an unrecorded operating figure empty when only a plan exists", () => {
    expect(readFacilityCapacity(null, 1100)).toEqual({
      currentMw: null,
      plannedMw: 1100,
    });
    expect(peerComparableMw(readFacilityCapacity(null, 1100))).toBeNull();
    expect(formatFacilityMw(null)).toBe("—");
  });
});
