import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  STARTUPS_BATCH_MAX,
  STARTUPS_DUPLICATE_ERROR,
  STARTUPS_HOMEPAGE_ERROR,
} from "@/lib/investigations/startups";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "startups.ts"),
  "utf8",
);
const queries = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../startups/queries.ts"),
  "utf8",
);
const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../migrations/20260915b_startups.ts",
  ),
  "utf8",
);

const BAKED_COMPANIES =
  /Anthropic|Mistral AI|Hugging Face|Cohere|Perplexity|LangChain|Pinecone|Weaviate|Fireworks AI|Figure AI|Agility Robotics|Apptronik|1X Technologies|Physical Intelligence|Skild AI|Aalo Atomics|Emerald AI/;

describe("startups router locks", () => {
  it("gates writes on Hub operators and lists from Neon only", () => {
    expect(src).toContain("requireHubOperator");
    expect(src).toContain("createStartup");
    expect(src).toContain("createStartups");
    expect(src).toContain("updateStartup");
    expect(src).toContain("listApprovedPublicStartups");
    expect(src).toContain("STARTUPS_BATCH_MAX");
    expect(src).toContain("STARTUPS_HOMEPAGE_ERROR");
    expect(src).toContain("STARTUPS_DUPLICATE_ERROR");
    expect(STARTUPS_HOMEPAGE_ERROR).toMatch(/homepage URL/i);
    expect(STARTUPS_DUPLICATE_ERROR).toMatch(/already/i);
    expect(STARTUPS_BATCH_MAX).toBe(30);
    expect(src).not.toMatch(BAKED_COMPANIES);
  });

  it("does not fall back to a hardcoded seed list when Neon is empty", () => {
    expect(queries).toContain("listApprovedPublicStartups");
    expect(queries).toMatch(/return \[\]/);
    expect(queries).not.toMatch(/curatedPublic|SEEDS|seedCards/);
    expect(queries).not.toMatch(/unstable_cache|revalidateTag/);
    expect(queries).not.toMatch(BAKED_COMPANIES);
  });

  it("keeps the schema migration insert-free", () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "app"."startup"');
    expect(migration).not.toMatch(/INSERT INTO/i);
    expect(migration).not.toMatch(BAKED_COMPANIES);
  });
});
