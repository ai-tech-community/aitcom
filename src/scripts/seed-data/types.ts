import type { DatacenterSource } from "@/server/db/schema";

export type SeedDatacenter = {
  slug: string;
  name: string;
  operatorSlug: string;
  status:
    | "announced"
    | "under-construction"
    | "operational"
    | "expanding"
    | "decommissioned"
    | "cancelled";
  aiDedicated: boolean;
  lat: number;
  lng: number;
  city?: string;
  region?: string;
  country: string;
  capacityMw?: number;
  capacityMwPlanned?: number;
  primaryPowerSource?:
    | "grid-mixed"
    | "gas"
    | "nuclear"
    | "solar"
    | "wind"
    | "hydro"
    | "geothermal"
    | "hybrid";
  utilitySlug?: string;
  coolingType?:
    | "air"
    | "open-loop"
    | "closed-loop"
    | "direct-to-chip"
    | "immersion";
  description?: string;
  sources: DatacenterSource[];
};

export type SeedBrand = {
  slug: string;
  canonicalName: string;
  website?: string;
};

export type SupplierCategory =
  | "gc"
  | "civil"
  | "electrical"
  | "transformer"
  | "backup-power"
  | "cooling"
  | "fiber"
  | "hardware"
  | "security"
  | "staffing"
  | "other";

export type SeedSupplier = {
  datacenterSlug: string;
  supplierSlug: string;
  category: SupplierCategory;
  role?: string;
  contractValueUsd?: number;
  isLocal?: boolean;
  sources: DatacenterSource[];
};
