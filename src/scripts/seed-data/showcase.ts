/**
 * Core brands and the showcase datacenter set.
 *
 * These were previously declared inline in seed-datacenters.ts, which imports a
 * live database handle. That made them unimportable from tests, and easy to miss
 * when enumerating the dataset — the seed files are not the whole picture without
 * them. Extracted so the full dataset can be validated without opening a
 * connection.
 */

import type { SeedDatacenter, SeedBrand } from "./types";

export const CORE_BRANDS: SeedBrand[] = [
  {
    slug: "aws",
    canonicalName: "Amazon Web Services",
    website: "https://aws.amazon.com",
  },
  {
    slug: "microsoft",
    canonicalName: "Microsoft",
    website: "https://microsoft.com",
  },
  { slug: "google", canonicalName: "Google", website: "https://google.com" },
  { slug: "meta", canonicalName: "Meta", website: "https://meta.com" },
  { slug: "oracle", canonicalName: "Oracle", website: "https://oracle.com" },
  { slug: "openai", canonicalName: "OpenAI", website: "https://openai.com" },
  { slug: "xai", canonicalName: "xAI", website: "https://x.ai" },
  {
    slug: "coreweave",
    canonicalName: "CoreWeave",
    website: "https://coreweave.com",
  },
  { slug: "crusoe", canonicalName: "Crusoe", website: "https://crusoe.ai" },
  { slug: "equinix", canonicalName: "Equinix", website: "https://equinix.com" },
  {
    slug: "digital-realty",
    canonicalName: "Digital Realty",
    website: "https://digitalrealty.com",
  },
  { slug: "tva", canonicalName: "Tennessee Valley Authority" },
  { slug: "ercot", canonicalName: "ERCOT" },
];

// Operator slug normalization (in case agents emitted variants)
export const SLUG_NORMALIZE: Record<string, string> = {
  "amazon-web-services": "aws",
  "microsoft-azure": "microsoft",
  "google-cloud": "google",
  "oracle-cloud": "oracle",
  "ntt-gdc": "ntt",
};

export function normalize(slug: string): string {
  return SLUG_NORMALIZE[slug] ?? slug;
}

export const SHOWCASE: SeedDatacenter[] = [
  {
    slug: "stargate-abilene",
    name: "Stargate — Abilene Campus",
    operatorSlug: "openai",
    status: "under-construction",
    aiDedicated: true,
    lat: 32.4487,
    lng: -99.7331,
    city: "Abilene",
    region: "TX",
    country: "US",
    capacityMwPlanned: 1200,
    primaryPowerSource: "gas",
    utilitySlug: "ercot",
    coolingType: "direct-to-chip",
    description:
      "First Stargate site under the OpenAI / Oracle / SoftBank joint venture, targeting up to 1.2 GW for AI training workloads.",
    sources: [
      {
        url: "https://openai.com/index/announcing-the-stargate-project/",
        type: "operator",
      },
    ],
  },
  {
    slug: "xai-colossus-memphis",
    name: "Colossus — Memphis",
    operatorSlug: "xai",
    status: "operational",
    aiDedicated: true,
    lat: 35.0726,
    lng: -90.0186,
    city: "Memphis",
    region: "TN",
    country: "US",
    capacityMw: 250,
    capacityMwPlanned: 1000,
    primaryPowerSource: "gas",
    utilitySlug: "tva",
    coolingType: "direct-to-chip",
    description:
      "xAI's primary training cluster, originally 100k H100s, expanding toward 1M GPUs. Powered partly by on-site gas turbines.",
    sources: [{ url: "https://x.ai/blog/colossus", type: "operator" }],
  },
  {
    slug: "meta-hyperion-richland",
    name: "Hyperion — Richland Parish",
    operatorSlug: "meta",
    status: "under-construction",
    aiDedicated: true,
    lat: 32.4393,
    lng: -91.7626,
    city: "Richland Parish",
    region: "LA",
    country: "US",
    capacityMwPlanned: 2000,
    primaryPowerSource: "gas",
    coolingType: "direct-to-chip",
    description:
      "Meta's largest planned AI campus, ~2 GW IT load at full build-out. Supplied by new gas plants from Entergy.",
    sources: [
      {
        url: "https://about.fb.com/news/2024/12/meta-louisiana-ai-data-center/",
        type: "pr",
      },
    ],
  },
  {
    slug: "microsoft-mt-pleasant",
    name: "Microsoft Mt. Pleasant Campus",
    operatorSlug: "microsoft",
    status: "under-construction",
    aiDedicated: true,
    lat: 42.7144,
    lng: -87.9337,
    city: "Mount Pleasant",
    region: "WI",
    country: "US",
    capacityMwPlanned: 900,
    primaryPowerSource: "grid-mixed",
    description: "Microsoft's Wisconsin AI campus on the former Foxconn site.",
    sources: [
      {
        url: "https://blogs.microsoft.com/on-the-issues/2024/05/08/wisconsin-data-center-investment-ai/",
        type: "pr",
      },
    ],
  },
  {
    slug: "aws-northern-virginia-pjm",
    name: "AWS Northern Virginia Cluster",
    operatorSlug: "aws",
    status: "operational",
    aiDedicated: false,
    lat: 39.0438,
    lng: -77.4874,
    city: "Ashburn",
    region: "VA",
    country: "US",
    capacityMw: 3000,
    primaryPowerSource: "grid-mixed",
    description:
      "Loudoun County / 'Data Center Alley' — the world's densest concentration of cloud capacity.",
    sources: [
      { url: "https://www.loudoun.gov/4922/Data-Centers", type: "other" },
    ],
  },
  {
    slug: "google-the-dalles",
    name: "Google The Dalles",
    operatorSlug: "google",
    status: "operational",
    aiDedicated: false,
    lat: 45.6,
    lng: -121.18,
    city: "The Dalles",
    region: "OR",
    country: "US",
    capacityMw: 350,
    primaryPowerSource: "hydro",
    coolingType: "open-loop",
    description:
      "Google's flagship Pacific Northwest campus, hydropower-fed, water-cooled from the Columbia River.",
    sources: [
      {
        url: "https://www.google.com/about/datacenters/locations/the-dalles/",
        type: "operator",
      },
    ],
  },
  {
    slug: "oracle-stargate-abilene-2",
    name: "Oracle Abilene Phase 2",
    operatorSlug: "oracle",
    status: "announced",
    aiDedicated: true,
    lat: 32.45,
    lng: -99.74,
    city: "Abilene",
    region: "TX",
    country: "US",
    capacityMwPlanned: 800,
    primaryPowerSource: "gas",
    coolingType: "direct-to-chip",
    description: "Oracle's Phase 2 expansion of the Stargate Abilene campus.",
    sources: [{ url: "https://www.oracle.com/news/announcement/", type: "pr" }],
  },
  {
    slug: "coreweave-plano",
    name: "CoreWeave Plano",
    operatorSlug: "coreweave",
    status: "operational",
    aiDedicated: true,
    lat: 33.0198,
    lng: -96.6989,
    city: "Plano",
    region: "TX",
    country: "US",
    capacityMw: 200,
    primaryPowerSource: "grid-mixed",
    coolingType: "direct-to-chip",
    description: "CoreWeave's Texas GPU cluster, leased to large AI labs.",
    sources: [
      { url: "https://www.coreweave.com/data-centers", type: "operator" },
    ],
  },
];
