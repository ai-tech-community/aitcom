/**
 * Generate an AI challenge from community signals.
 * Run with: pnpm payload run scripts/generate-challenge.ts
 *
 * Options (via env vars):
 *   AUTO_PUBLISH=true   — publish as active (default: draft)
 *   DAY_WINDOW=14       — look back N days for signals (default: 14)
 */
import { getPayload } from "payload";
import config from "@payload-config";

// Initialize Payload so getPayloadClient() works
await getPayload({ config });

// Dynamic import after Payload is initialized
const { runChallengeEngine } = await import("@/server/challenge-engine");

const autoPublish = process.env.AUTO_PUBLISH === "true";
const dayWindow = parseInt(process.env.DAY_WINDOW ?? "14", 10);

console.log("Challenge Engine starting...");
console.log("  autoPublish:", autoPublish);
console.log("  dayWindow:", dayWindow, "days");
console.log();

const result = await runChallengeEngine({ autoPublish, dayWindow });

if (result.error) {
  console.error("Engine error:", result.error);
  process.exit(1);
}

console.log("Signals detected:", result.signals);
console.log();

if (result.generated) {
  console.log("Generated challenge:");
  console.log("  Title:", result.generated.title);
  console.log("  Slug:", result.generated.slug);
  console.log("  Type:", result.generated.type);
  console.log("  Difficulty:", result.generated.difficulty);
}

if (result.published) {
  console.log();
  console.log("Published:");
  console.log("  ID:", result.published.id);
  console.log("  Status:", autoPublish ? "active" : "draft (review in Payload admin)");
}

console.log("\nDone!");
process.exit(0);
