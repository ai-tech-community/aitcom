import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/datacenters/publish-facility", () => ({
  publishDatacenterFacility: vi.fn(),
}));

import { DATACENTER_STATUS, PERMIT_KINDS } from "@/server/db/schema";

import { DatacenterFacilities } from "./DatacenterFacilities";

type Field = {
  name?: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  options?: Array<{ label: string; value: string }>;
  fields?: Field[];
};

const fieldsOf = (fields: unknown) => fields as Field[];
const pick = (name: string) =>
  fieldsOf(DatacenterFacilities.fields).find((field) => field.name === name)!;

describe("datacenter facilities collection", () => {
  it("edits the live facility fields and reuses the status enum", () => {
    expect(DatacenterFacilities.slug).toBe("datacenter-facilities");
    expect(DatacenterFacilities.dbName).toBe("datacenter_facilities");
    expect(
      fieldsOf(DatacenterFacilities.fields).map((field) => field.name),
    ).toEqual([
      "name",
      "operator",
      "country",
      "city",
      "lat",
      "lng",
      "capacityMw",
      "status",
      "sourceUrl",
      "checkedAt",
      "slug",
      "permits",
    ]);
    expect(pick("sourceUrl").required).toBe(true);
    expect(pick("checkedAt").required).toBe(true);
    expect(pick("capacityMw").required).toBeUndefined();
    expect(pick("slug").unique).toBe(true);
    expect(pick("status").options?.map((option) => option.value)).toEqual([
      ...DATACENTER_STATUS,
    ]);
    const permitKind = pick("permits").fields?.find(
      (field) => field.name === "kind",
    );
    expect(permitKind?.options?.map((option) => option.value)).toEqual([
      ...PERMIT_KINDS,
    ]);
  });
});
