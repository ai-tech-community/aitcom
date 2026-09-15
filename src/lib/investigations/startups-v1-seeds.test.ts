import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import payload from "../../../docs/ops/fixtures/startups-batch1-payload.json";
import {
  STARTUPS_V1_LISTED_ON,
  STARTUPS_V1_OVERFLOW_HOMEPAGES,
  STARTUPS_V1_SEEDS,
  startupsV1PublicCards,
} from "./startups-v1-seeds";
import { buildStartupInsights } from "./startups-insights";
import {
  displayStartupSources,
  normalizeStartupHomepage,
  parseStartupCategory,
  presentText,
  startupMapPins,
} from "./startups";

const BANNED_METRIC =
  /valuation|headcount|attendance|unicorn|employees|\bARR\b|largest|growth rate/i;

const SHIP_NAMES = [
  "Figure AI",
  "Agility Robotics",
  "Apptronik",
  "1X Technologies",
  "Physical Intelligence",
  "Skild AI",
  "Crusoe",
  "Aalo Atomics",
  "Oklo",
  "Emerald AI",
  "Anthropic",
  "Mistral AI",
  "Cohere",
  "Hugging Face",
  "LangChain",
  "Pinecone",
  "Weaviate",
  "Fireworks AI",
  "Perplexity",
  "Cursor (Anysphere)",
] as const;

const OVERFLOW_NAMES = [
  "Together AI",
  "Replicate",
  "Midjourney",
  "ElevenLabs",
  "Runway",
  "Scale AI",
  "Glean",
  "Sierra",
  "Factory",
  "Cognition (Devin)",
] as const;

describe("Startups v1 Ops-Passed seeds", () => {
  it("is exactly the 20 ship-list companies, no overflow", () => {
    expect(STARTUPS_V1_SEEDS).toHaveLength(20);
    expect(STARTUPS_V1_SEEDS.map((row) => row.name).sort()).toEqual(
      [...SHIP_NAMES].sort(),
    );
    const names = new Set(STARTUPS_V1_SEEDS.map((row) => row.name));
    for (const overflow of OVERFLOW_NAMES) {
      expect(names.has(overflow)).toBe(false);
    }
    expect(STARTUPS_V1_OVERFLOW_HOMEPAGES).toEqual([
      "https://www.together.ai",
      "https://replicate.com",
      "https://www.midjourney.com",
      "https://elevenlabs.io",
      "https://runway.com",
      "https://scale.com",
      "https://www.glean.com",
      "https://sierra.ai",
      "https://factory.ai",
      "https://cognition.com",
    ]);
  });

  it("carries Pulse homepage, category, 1–3 sources, and soft-omits blank region/stage", () => {
    expect(STARTUPS_V1_LISTED_ON).toBe("2026-09-15");
    const ids = new Set<string>();
    const homepages = new Set<string>();

    for (const row of STARTUPS_V1_SEEDS) {
      expect(row.id).toMatch(/^startup-[a-z0-9-]+$/);
      expect(ids.has(row.id)).toBe(false);
      ids.add(row.id);

      const homepage = normalizeStartupHomepage(row.homepage);
      expect(homepage).toBe(row.homepage);
      expect(homepages.has(homepage!)).toBe(false);
      homepages.add(homepage!);

      expect(parseStartupCategory(row.category)).toBe(row.category);
      expect(displayStartupSources(row.sources).length).toBeGreaterThanOrEqual(
        1,
      );
      expect(displayStartupSources(row.sources).length).toBeLessThanOrEqual(3);
      expect(row.listedOn).toBe(STARTUPS_V1_LISTED_ON);
      expect(row.stage).toBeNull();
      expect(presentText(row.region)).toBe(row.region);
      expect(row).not.toHaveProperty("valuation");
      expect(row).not.toHaveProperty("headcount");
      expect(JSON.stringify(row)).not.toMatch(BANNED_METRIC);
    }

    const byName = new Map(STARTUPS_V1_SEEDS.map((row) => [row.name, row]));
    expect(byName.get("Cohere")?.region).toBe("Toronto, Canada");
    expect(byName.get("Pinecone")?.region).toBe("New York, US");
    expect(
      STARTUPS_V1_SEEDS.filter((row) => row.region != null).map(
        (row) => row.name,
      ),
    ).toEqual(["Cohere", "Pinecone"]);
  });

  it("matches the Pulse batch-1 fixture and stays out of overflow homepages", () => {
    expect(payload.count).toBe(20);
    expect(payload.seeds.map((row) => row.name).sort()).toEqual(
      STARTUPS_V1_SEEDS.map((row) => row.name).sort(),
    );
    const seedHomepages = new Set(STARTUPS_V1_SEEDS.map((row) => row.homepage));
    for (const row of payload.seeds) {
      const homepage = normalizeStartupHomepage(row.homepage);
      expect(homepage).toBeTruthy();
      expect(seedHomepages.has(homepage!)).toBe(true);
      expect(STARTUPS_V1_OVERFLOW_HOMEPAGES).not.toContain(homepage);
    }
  });

  it("pins only sourced city/region centroids; unknown stays list-only", () => {
    const cards = startupsV1PublicCards();
    const pins = startupMapPins(cards);
    expect(pins).toHaveLength(2);
    expect(pins.map((pin) => pin.region).sort()).toEqual([
      "New York, US",
      "Toronto, Canada",
    ]);
    expect(pins.every((pin) => !/street|avenue|road/i.test(pin.region ?? ""))).toBe(
      true,
    );
    expect(cards.filter((card) => card.lat == null && card.lng == null)).toHaveLength(
      18,
    );
  });

  it("feeds Insights from listed seed rows only", () => {
    const stats = buildStartupInsights(startupsV1PublicCards(), "en");
    expect(stats.total).toBe(20);
    expect(
      Object.fromEntries(stats.categoryMix.map((row) => [row.id, row.count])),
    ).toEqual({
      robotics: 6,
      "ai-infra": 5,
      energy: 4,
      models: 3,
      agents: 1,
      vertical: 1,
    });
    expect(stats.regionMix).toEqual([
      { region: "New York, US", count: 1 },
      { region: "Toronto, Canada", count: 1 },
    ]);
    expect(stats.addedOverTime).toEqual([
      { month: "2026-09", label: "Sep 2026", count: 20 },
    ]);
  });
});

describe("Startups v1 seed migration", () => {
  it("inserts the 20 rows into Neon and is registered after the schema migration", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const migration = readFileSync(
      join(root, "migrations/20260915c_startups_v1_seeds.ts"),
      "utf8",
    );
    const index = readFileSync(join(root, "migrations/index.ts"), "utf8");
    expect(migration).toMatch(/INSERT INTO "app"\."startup"/);
    expect(migration).toContain("STARTUPS_V1_SEEDS");
    expect(migration).toContain("ON CONFLICT");
    expect(index).toContain("20260915c_startups_v1_seeds");
    expect(index).toMatch(
      /20260915b_startups[\s\S]*20260915c_startups_v1_seeds/,
    );
    for (const overflow of OVERFLOW_NAMES) {
      expect(migration).not.toContain(overflow);
    }
  });
});
