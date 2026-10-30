import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/server/payload", () => ({
  getPayloadClient: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/content-visibility-queries", () => ({
  hiddenContentCommunityIds: vi.fn(async () => []),
}));

import { FacilityProvenance } from "@/components/datacenters/facility-provenance";
import { buildSitemapEntries } from "@/app/sitemap";
import {
  operatorMatches,
  publishFacilityWithRepo,
  type FacilityRepo,
  type StoredFacility,
} from "./datacenter-facilities";

const SOURCE = "https://example.com/filing";
const CHECKED = "2026-10-28T00:00:00.000Z";
const NOW = new Date("2026-10-30T15:04:00.000Z");

function facility(overrides: Record<string, unknown> = {}) {
  return {
    name: "Fairwater",
    operator: "Microsoft",
    country: "US",
    city: "Mount Pleasant",
    lat: 42.7,
    lng: -87.9,
    capacity_mw: 300,
    status: "operational",
    source_url: SOURCE,
    checked_at: CHECKED,
    ...overrides,
  };
}

function memoryRepo(seed: StoredFacility[] = []) {
  const rows = [...seed];
  const repo: FacilityRepo = {
    findBySlug: async (slug) => rows.find((row) => row.slug === slug) ?? null,
    findByNameOperator: async (name, operator) =>
      rows.find(
        (row) =>
          row.name.toLowerCase() === name.trim().toLowerCase() &&
          operatorMatches(
            { slug: row.operatorKey, canonicalName: row.operatorName },
            operator,
          ),
      ) ?? null,
    slugTaken: async (slug) => rows.some((row) => row.slug === slug),
    save: async (input) => {
      const previous = rows.find((row) => row.id === input.id);
      const stored: StoredFacility = {
        id: input.id ?? `id-${rows.length + 1}`,
        slug: input.slug,
        name: input.name,
        operatorKey: input.operatorKey,
        operatorName: input.operatorName,
        country: input.country,
        city: input.city,
        lat: input.lat,
        lng: input.lng,
        capacityMw: input.capacityMw,
        status: input.status,
        sourceUrl: input.sourceUrl,
        checkedAt: input.checkedAt,
        updatedAt: input.updatedAt,
        sources: input.sources,
        permits: input.permits ?? previous?.permits ?? [],
      };
      const index = rows.findIndex((row) => row.id === stored.id);
      if (index >= 0) rows[index] = stored;
      else rows.push(stored);
      return stored;
    },
  };
  return { repo, rows };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("facility writes", () => {
  it("requires an https source and a checked-at time", async () => {
    const { repo } = memoryRepo();
    const http = await publishFacilityWithRepo(
      facility({ source_url: "http://example.com/filing" }),
      repo,
      NOW,
    );
    const missing = await publishFacilityWithRepo(
      facility({ checked_at: "" }),
      repo,
      NOW,
    );
    expect(http).toEqual({
      ok: false,
      error: "source_url must be an https URL.",
    });
    expect(missing).toEqual({
      ok: false,
      error: "checked_at is required and must be an ISO 8601 timestamp.",
    });
    expect(repo).toBeTruthy();
  });

  it("stores planned and operating as the existing status values", async () => {
    const { repo, rows } = memoryRepo();
    const saved = await publishFacilityWithRepo(
      facility({ status: "planned" }),
      repo,
      NOW,
    );
    expect(saved.ok && saved.status).toBe("under-construction");
    expect(rows[0]?.status).toBe("under-construction");
    const operating = await publishFacilityWithRepo(
      facility({ name: "Other", status: "operating" }),
      repo,
      NOW,
    );
    expect(operating.ok && operating.status).toBe("operational");
  });

  it("keeps the existing slug when the same name and operator are saved again", async () => {
    const { repo } = memoryRepo();
    const created = await publishFacilityWithRepo(facility(), repo, NOW);
    expect(created.ok && created.slug).toBe("fairwater");
    const again = await publishFacilityWithRepo(
      facility({
        slug: "a-different-slug",
        capacity_mw: 400,
        source_url: "https://example.com/update",
        checked_at: "2026-10-29T00:00:00.000Z",
      }),
      repo,
      NOW,
    );
    expect(again).toMatchObject({
      ok: true,
      inserted: false,
      slug: "fairwater",
      url: "https://www.aitcommunity.org/en/investigations/datacenters/fairwater",
      sourceUrl: "https://example.com/update",
      checkedAt: "2026-10-29T00:00:00.000Z",
    });
  });

  it("matches an operator by its canonical name and does not rename the slug", async () => {
    const { repo, rows } = memoryRepo([
      {
        id: "existing",
        slug: "aws-example",
        name: "Example Campus",
        operatorKey: "aws",
        operatorName: "Amazon Web Services",
        country: "US",
        city: "Ashburn",
        lat: 39,
        lng: -77,
        capacityMw: 10,
        status: "operational",
        sourceUrl: SOURCE,
        checkedAt: new Date(CHECKED),
        updatedAt: NOW,
        sources: [{ url: SOURCE }],
        permits: [],
      },
    ]);
    const saved = await publishFacilityWithRepo(
      facility({
        name: "Example Campus",
        operator: "Amazon Web Services",
        capacity_mw: 12,
      }),
      repo,
      NOW,
    );
    expect(saved).toMatchObject({
      ok: true,
      inserted: false,
      slug: "aws-example",
    });
    expect(rows[0]?.operatorKey).toBe("aws");
    expect(rows[0]?.capacityMw).toBe(12);
  });
});

describe("saved facility publication", () => {
  it("keeps a stable URL, lists it in the sitemap with its updated date, and shows the source and checked-at", async () => {
    const { repo } = memoryRepo();
    const created = await publishFacilityWithRepo(facility(), repo, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const saved = await publishFacilityWithRepo(
      facility({ slug: created.slug, name: "Fairwater Campus" }),
      repo,
      new Date("2026-10-31T08:00:00.000Z"),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.inserted).toBe(false);
    expect(saved.slug).toBe(created.slug);
    expect(saved.url).toBe(
      "https://www.aitcommunity.org/en/investigations/datacenters/fairwater",
    );
    expect(saved.path).toBe("/investigations/datacenters/fairwater");
    expect(saved.sourceUrl).toBe(SOURCE);
    expect(saved.checkedAt).toBe(CHECKED);

    const entries = await buildSitemapEntries(
      async () => {
        throw new Error("skip payload");
      },
      async () => new Map(),
      async () => [],
      async () => [],
      async () => [],
      async () => new Map(),
      async () => [],
      async () => [{ path: saved.path, updatedAt: new Date(saved.updatedAt) }],
    );
    const facilityEntry = entries.find((entry) => entry.url === saved.url);
    expect(facilityEntry?.lastModified).toEqual(new Date(saved.updatedAt));
    expect(facilityEntry?.lastModified).not.toEqual(new Date(CHECKED));
    const hub = entries.find(
      (entry) => entry.url === "https://www.aitcommunity.org/en/investigations",
    );
    expect(hub?.lastModified).toEqual(new Date(saved.updatedAt));

    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FacilityProvenance
          sourceUrl={saved.sourceUrl}
          checkedAt={saved.checkedAt}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("link", { name: SOURCE })).toHaveAttribute(
      "href",
      SOURCE,
    );
    expect(screen.getByText("Checked 2026.10.28")).toBeInTheDocument();
    expect(document.querySelector("time")).toHaveAttribute("dateTime", CHECKED);
  });
});
