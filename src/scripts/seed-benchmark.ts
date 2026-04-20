/**
 * Seed script for benchmark taxonomy + starter brands.
 *
 * Idempotent — uses onConflictDoNothing so it is safe to re-run.
 *
 * Usage:
 *   npx tsx src/scripts/seed-benchmark.ts
 */

import { db } from "@/server/db";
import {
  benchmarkCategories,
  benchmarkIntents,
  brands,
} from "@/server/db/schema";
import { SEED_INTENTS } from "@/lib/benchmark-constants";
import { eq } from "drizzle-orm";

async function main() {
  // Intents
  for (const i of SEED_INTENTS) {
    await db
      .insert(benchmarkIntents)
      .values({ slug: i.slug, name: i.name, description: i.description })
      .onConflictDoNothing();
  }

  // Top-level categories
  const CATS = [
    { slug: "saas", name: "SaaS" },
    { slug: "ecommerce", name: "E-commerce" },
    { slug: "travel", name: "Travel" },
    { slug: "finance", name: "Finance" },
    { slug: "devtools", name: "DevTools" },
    { slug: "ai-tools", name: "AI Tools" },
    { slug: "health", name: "Health" },
    { slug: "media", name: "Media" },
  ];
  for (const c of CATS) {
    await db
      .insert(benchmarkCategories)
      .values({ slug: c.slug, name: c.name })
      .onConflictDoNothing();
  }

  const aiToolsRow = await db
    .select()
    .from(benchmarkCategories)
    .where(eq(benchmarkCategories.slug, "ai-tools"))
    .limit(1);
  const aiTools = aiToolsRow[0];
  if (!aiTools) throw new Error("ai-tools category insert failed");

  // Starter brands for AI tools
  const AI_BRANDS = [
    {
      slug: "openai",
      canonicalName: "OpenAI",
      aliases: ["chatgpt", "gpt-4", "gpt"],
    },
    { slug: "anthropic", canonicalName: "Anthropic", aliases: ["claude"] },
    {
      slug: "google-gemini",
      canonicalName: "Google Gemini",
      aliases: ["gemini", "bard"],
    },
    { slug: "meta-llama", canonicalName: "Meta Llama", aliases: ["llama"] },
    { slug: "perplexity", canonicalName: "Perplexity", aliases: [] },
  ];
  for (const b of AI_BRANDS) {
    await db
      .insert(brands)
      .values({
        slug: b.slug,
        canonicalName: b.canonicalName,
        aliases: b.aliases,
        categoryIds: [aiTools.id],
        verified: true,
      })
      .onConflictDoNothing();
  }

  console.log("Seeded benchmark taxonomy + starter brands.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
