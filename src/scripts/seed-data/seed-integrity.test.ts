/**
 * Structural integrity of the datacenter seed data.
 *
 * These tests exist because of bugs that reached production and stayed there
 * unnoticed:
 *
 *   - `meta-temple` and `meta-temple-tx` were the same site seeded twice from two
 *     files, carrying contradictory capacities. `dedupeDatacenters()` compares
 *     slugs, so it saw two different sites and inserted both.
 *   - 13 further sites were defined twice under the *same* slug. Dedupe kept the
 *     first, so the second was dead code that silently disagreed with the winner.
 *   - Permits and subsidies referenced `meta-sarpy-county` and `apple-maiden-nc`,
 *     neither of which existed. `seed-investigations.ts` reports missing slugs at
 *     the end of its run, but nothing failed, so the findings were quietly lost.
 *
 * Every check here is cheap and pure — no database, no network.
 */

import { describe, it, expect } from "vitest";

import { NORTH_AMERICA, NA_BRANDS } from "./na";
import { EUROPE, EU_BRANDS } from "./eu";
import { APAC_ME_AF_LATAM, APAC_BRANDS } from "./apac";
import { AI_NATIVE, AI_NATIVE_BRANDS } from "./ai-native";
import { CORE_BRANDS, SHOWCASE, normalize } from "./showcase";
import {
  REFRESH_2026_07_DATACENTERS,
  REFRESH_2026_07_BRANDS,
  REFRESH_2026_07_PERMITS,
  REFRESH_2026_07_SUBSIDIES,
  REFRESH_2026_07_CAPEX,
  REFRESH_2026_07_SUPPLIERS,
} from "./refresh-2026-07";
import { PERMITS } from "./permits";
import { SUBSIDIES } from "./subsidies";
import { CAPEX_UPDATES } from "./capex";
import type { SeedDatacenter } from "./types";

/** Every datacenter record, tagged with the file it came from. */
const SOURCES: Array<{ file: string; records: SeedDatacenter[] }> = [
  { file: "showcase.ts", records: SHOWCASE },
  { file: "na.ts", records: NORTH_AMERICA },
  { file: "eu.ts", records: EUROPE },
  { file: "apac.ts", records: APAC_ME_AF_LATAM },
  { file: "ai-native.ts", records: AI_NATIVE },
  { file: "refresh-2026-07.ts", records: REFRESH_2026_07_DATACENTERS },
];

const ALL_DATACENTERS = SOURCES.flatMap((s) =>
  s.records.map((r) => ({ ...r, __file: s.file })),
);

const ALL_BRAND_SLUGS = new Set(
  [
    CORE_BRANDS,
    NA_BRANDS,
    EU_BRANDS,
    APAC_BRANDS,
    AI_NATIVE_BRANDS,
    REFRESH_2026_07_BRANDS,
  ]
    .flat()
    .map((b) => normalize(b.slug)),
);

const DATACENTER_SLUGS = new Set(ALL_DATACENTERS.map((d) => d.slug));

/**
 * Same-operator coordinate collisions that are genuinely two different records.
 *
 * Keep this list short and always say why. Every entry is a place where the
 * duplicate check is deliberately blind, so an entry added carelessly re-opens
 * the exact hole this test was written to close.
 */
const ALLOWED_COORDINATE_COLLISIONS = [
  // "AWS Northern Virginia Cluster" is a regional aggregate for Loudoun County's
  // Data Center Alley (3 GW across many buildings), not a single facility. The
  // Ashburn campus is one specific site inside it. Both carry a county-level
  // point, so they collide without being the same building.
  "aws @ 39.0438,-77.4874",
];

describe("datacenter seed data", () => {
  it("defines each slug exactly once", () => {
    const seen = new Map<string, string[]>();
    for (const d of ALL_DATACENTERS) {
      seen.set(d.slug, [...(seen.get(d.slug) ?? []), d.__file]);
    }
    const duplicates = [...seen.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([slug, files]) => `${slug} defined in ${files.join(" and ")}`);

    expect(duplicates).toEqual([]);
  });

  it("has no two records for the same operator at identical coordinates", () => {
    // A site seeded twice under different slugs is invisible to slug dedupe. Two
    // records sharing an operator AND an exact coordinate are almost always one
    // facility — that is precisely the meta-temple / meta-temple-tx bug.
    //
    // Coordinates alone are not enough to judge: city centroids are used widely
    // where an operator publishes no parcel, so AWS, Azure and Google all sit on
    // Tokyo's centre point without being the same building. Keying on operator
    // removes that noise while keeping the signal.
    const byOperatorPoint = new Map<string, string[]>();
    for (const d of ALL_DATACENTERS) {
      const key = `${normalize(d.operatorSlug)} @ ${d.lat.toFixed(4)},${d.lng.toFixed(4)}`;
      byOperatorPoint.set(key, [
        ...(byOperatorPoint.get(key) ?? []),
        `${d.slug} (${d.__file})`,
      ]);
    }
    const collisions = [...byOperatorPoint.entries()]
      .filter(([, slugs]) => slugs.length > 1)
      .map(([key, slugs]) => `${key}: ${slugs.join(" | ")}`)
      .filter(
        (c) => !ALLOWED_COORDINATE_COLLISIONS.some((a) => c.startsWith(a)),
      );

    expect(collisions).toEqual([]);
  });

  it("points every operatorSlug at a brand that exists", () => {
    const missing = ALL_DATACENTERS.filter(
      (d) => !ALL_BRAND_SLUGS.has(normalize(d.operatorSlug)),
    ).map((d) => `${d.slug} -> ${d.operatorSlug} (${d.__file})`);

    expect(missing).toEqual([]);
  });

  it("points every utilitySlug at a brand that exists", () => {
    const missing = ALL_DATACENTERS.filter(
      (d) => d.utilitySlug && !ALL_BRAND_SLUGS.has(normalize(d.utilitySlug)),
    ).map((d) => `${d.slug} -> ${d.utilitySlug} (${d.__file})`);

    expect(missing).toEqual([]);
  });

  it("gives every record at least one source", () => {
    const uncited = ALL_DATACENTERS.filter(
      (d) => !d.sources?.length || d.sources.some((s) => !s.url),
    ).map((d) => `${d.slug} (${d.__file})`);

    expect(uncited).toEqual([]);
  });

  it("keeps coordinates on Earth and off null island", () => {
    const bad = ALL_DATACENTERS.filter(
      (d) =>
        !Number.isFinite(d.lat) ||
        !Number.isFinite(d.lng) ||
        d.lat < -90 ||
        d.lat > 90 ||
        d.lng < -180 ||
        d.lng > 180 ||
        (d.lat === 0 && d.lng === 0),
    ).map((d) => `${d.slug}: ${d.lat},${d.lng} (${d.__file})`);

    expect(bad).toEqual([]);
  });

  it("uses ISO-3166 alpha-2 country codes", () => {
    const bad = ALL_DATACENTERS.filter(
      (d) => !/^[A-Z]{2}$/.test(d.country),
    ).map((d) => `${d.slug}: "${d.country}" (${d.__file})`);

    expect(bad).toEqual([]);
  });

  it("keeps capacityMw at or below capacityMwPlanned", () => {
    const bad = ALL_DATACENTERS.filter(
      (d) =>
        d.capacityMw != null &&
        d.capacityMwPlanned != null &&
        d.capacityMw > d.capacityMwPlanned,
    ).map(
      (d) =>
        `${d.slug}: ${d.capacityMw} > ${d.capacityMwPlanned} (${d.__file})`,
    );

    expect(bad).toEqual([]);
  });
});

describe("investigation records attach to a real datacenter", () => {
  const CHILDREN: Array<{ kind: string; slugs: string[] }> = [
    {
      kind: "permits",
      slugs: [...PERMITS, ...REFRESH_2026_07_PERMITS].map(
        (p) => p.datacenterSlug,
      ),
    },
    {
      kind: "subsidies",
      slugs: [...SUBSIDIES, ...REFRESH_2026_07_SUBSIDIES].map(
        (s) => s.datacenterSlug,
      ),
    },
    {
      kind: "capex",
      slugs: [...CAPEX_UPDATES, ...REFRESH_2026_07_CAPEX].map(
        (c) => c.datacenterSlug,
      ),
    },
    {
      kind: "suppliers",
      slugs: REFRESH_2026_07_SUPPLIERS.map((s) => s.datacenterSlug),
    },
  ];

  for (const { kind, slugs } of CHILDREN) {
    it(`resolves every ${kind} datacenterSlug`, () => {
      const unresolved = [...new Set(slugs)].filter(
        (s) => !DATACENTER_SLUGS.has(s),
      );

      expect(unresolved).toEqual([]);
    });
  }
});
