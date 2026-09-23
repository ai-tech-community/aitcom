import payload from "../../../docs/ops/fixtures/startups-batch1-payload.json";
import {
  mapPulseStartupWrite,
  normalizeStartupHomepage,
  resolveStartupPinCoords,
  sanitizeStartupSources,
  startupSlugFromName,
  type StartupCategoryId,
  type StartupExitStatus,
  type StartupFounder,
  type StartupPublicCard,
} from "./startups";

/**
 * Ops-Passed Startups v1 (20/20). Pulse verified + enriched 2026-09-15.
 * Live rows are inserted into Neon by the seed migrations — not rendered
 * from this list in UI components. Canonical payload:
 * docs/ops/fixtures/startups-batch1-payload.json
 */
export const STARTUPS_V1_LISTED_ON = "2026-09-15";

/** Pulse overflow — not in v1. Kept so inserts cannot silently pick them up. */
export const STARTUPS_V1_OVERFLOW_HOMEPAGES = [
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
] as const;

/** Stable Neon ids. Order is the v1 ship list. */
const STARTUPS_V1_IDS = [
  ["Figure AI", "startup-figure-ai"],
  ["Agility Robotics", "startup-agility-robotics"],
  ["Apptronik", "startup-apptronik"],
  ["1X Technologies", "startup-1x-technologies"],
  ["Physical Intelligence", "startup-physical-intelligence"],
  ["Skild AI", "startup-skild-ai"],
  ["Crusoe", "startup-crusoe"],
  ["Aalo Atomics", "startup-aalo-atomics"],
  ["Oklo", "startup-oklo"],
  ["Emerald AI", "startup-emerald-ai"],
  ["Anthropic", "startup-anthropic"],
  ["Mistral AI", "startup-mistral-ai"],
  ["Cohere", "startup-cohere"],
  ["Hugging Face", "startup-hugging-face"],
  ["LangChain", "startup-langchain"],
  ["Pinecone", "startup-pinecone"],
  ["Weaviate", "startup-weaviate"],
  ["Fireworks AI", "startup-fireworks-ai"],
  ["Perplexity", "startup-perplexity"],
  ["Cursor (Anysphere)", "startup-cursor-anysphere"],
] as const;

export type StartupV1Seed = {
  id: string;
  name: string;
  homepage: string;
  category: StartupCategoryId;
  sources: string[];
  region: string | null;
  stage: string | null;
  logoUrl: string | null;
  description: string | null;
  founders: StartupFounder[];
  exitStatus: StartupExitStatus | null;
  acquirer: string | null;
  exitOn: string | null;
  jobsUrl: string | null;
  listedOn: string;
};

function homepage(href: string): string {
  const normalized = normalizeStartupHomepage(href);
  if (!normalized) {
    throw new Error(`Startups v1 seed has an invalid homepage: ${href}`);
  }
  return normalized;
}

function sourcesOf(hrefs: readonly string[]): string[] {
  const sources = sanitizeStartupSources(hrefs);
  if (sources.length < 1) {
    throw new Error("Startups v1 seed is missing verified sources.");
  }
  return sources;
}

function seedFromFixture(name: string, id: string): StartupV1Seed {
  const row = payload.seeds.find((seed) => seed.name === name);
  if (!row) {
    throw new Error(`Startups v1 fixture is missing ${name}`);
  }
  const mapped = mapPulseStartupWrite(row);
  if (!mapped.homepage || !mapped.category) {
    throw new Error(`Startups v1 fixture row is incomplete: ${name}`);
  }
  return {
    id,
    name: mapped.name,
    homepage: homepage(mapped.homepage),
    category: mapped.category,
    sources: sourcesOf(mapped.sources),
    region: mapped.region,
    stage: mapped.stage,
    logoUrl: mapped.logoUrl,
    description: mapped.description,
    founders: mapped.founders,
    exitStatus: mapped.exitStatus,
    acquirer: mapped.acquirer,
    exitOn: mapped.exitOn,
    jobsUrl: mapped.jobsUrl,
    listedOn: STARTUPS_V1_LISTED_ON,
  };
}

export const STARTUPS_V1_SEEDS: readonly StartupV1Seed[] = STARTUPS_V1_IDS.map(
  ([name, id]) => seedFromFixture(name, id),
);

if (STARTUPS_V1_SEEDS.length !== payload.count) {
  throw new Error(
    `Startups v1 seed count ${STARTUPS_V1_SEEDS.length} != fixture ${payload.count}`,
  );
}

export function startupsV1PublicCards(): StartupPublicCard[] {
  return STARTUPS_V1_SEEDS.map((row) => {
    const coords = resolveStartupPinCoords({
      region: row.region,
      lat: null,
      lng: null,
    });
    return {
      id: row.id,
      name: row.name,
      homepage: row.homepage,
      category: row.category,
      sources: row.sources,
      region: row.region,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      stage: row.stage,
      logoUrl: row.logoUrl,
      description: row.description,
      founders: row.founders,
      exitStatus: row.exitStatus,
      acquirer: row.acquirer,
      exitOn: row.exitOn,
      jobsUrl: row.jobsUrl,
      listedOn: row.listedOn,
      slug: startupSlugFromName(row.name),
      openRoleCount: 0,
    };
  });
}
