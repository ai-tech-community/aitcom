import { describe, expect, it } from "vitest";

import { ENTITY_CONFIG, ENTITY_TYPES, type EntityType } from "./entity-config";

describe("ENTITY_CONFIG", () => {
  it("covers all 9 entity types", () => {
    expect(ENTITY_TYPES).toEqual([
      "datacenter",
      "brand",
      "subsidy",
      "permit",
      "energy_deal",
      "ownership_edge",
      "datacenter_supplier",
      "datacenter_status_history",
      "datacenter_finding",
    ]);
    for (const t of ENTITY_TYPES) {
      expect(ENTITY_CONFIG[t]).toBeDefined();
    }
  });

  it("admin-only fields are also in editable fields for every entity", () => {
    for (const t of ENTITY_TYPES) {
      const cfg = ENTITY_CONFIG[t];
      for (const f of cfg.adminOnlyFields) {
        expect(cfg.editableFields.has(f)).toBe(true);
      }
    }
  });

  it("factual fields are a subset of editable fields", () => {
    for (const t of ENTITY_TYPES) {
      const cfg = ENTITY_CONFIG[t];
      for (const f of cfg.factualFields) {
        expect(cfg.editableFields.has(f)).toBe(true);
      }
    }
  });

  it("datacenter has expected admin-only fields per spec", () => {
    const cfg = ENTITY_CONFIG["datacenter" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("verified")).toBe(true);
    expect(cfg.adminOnlyFields.has("slug")).toBe(false);
  });

  it("datacenter has expected factual fields per spec", () => {
    const cfg = ENTITY_CONFIG["datacenter" satisfies EntityType];
    for (const f of [
      "capacityMw",
      "primaryPowerSource",
      "coolingType",
      "operatorId",
      "lat",
      "lng",
    ]) {
      expect(cfg.factualFields.has(f)).toBe(true);
    }
  });

  it("brand has expected admin-only fields", () => {
    const cfg = ENTITY_CONFIG["brand" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("verified")).toBe(true);
    expect(cfg.adminOnlyFields.has("slug")).toBe(false);
  });

  it("datacenter_supplier marks verified as admin-only", () => {
    const cfg = ENTITY_CONFIG["datacenter_supplier" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("verified")).toBe(true);
  });

  it("datacenter_finding marks status as admin-only", () => {
    const cfg = ENTITY_CONFIG["datacenter_finding" satisfies EntityType];
    expect(cfg.adminOnlyFields.has("status")).toBe(true);
  });
});
