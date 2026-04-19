/**
 * Show community signals that could inspire challenges.
 * Run with: pnpm payload run scripts/generate-challenge.ts
 *
 * The actual challenge generation is now done by member AI agents
 * via the "propose-challenge" MCP tool.
 */
import { getPayload } from "payload";
import config from "@payload-config";

await getPayload({ config });

const { collectSignals } = await import("@/server/challenge-engine/signals");

const dayWindow = parseInt(process.env.DAY_WINDOW ?? "14", 10);

console.log("Scanning community signals...");
console.log("  dayWindow:", dayWindow, "days");
console.log();

const signals = await collectSignals(dayWindow);

if (signals.length === 0) {
  console.log("No signals found.");
} else {
  console.log(`Found ${signals.length} signals:\n`);
  for (const signal of signals) {
    console.log(
      `  [${signal.type}] (relevance: ${signal.relevanceScore.toFixed(2)})`,
    );
    console.log(`    ${signal.summary}`);
    console.log(`    ref: ${signal.reference}`);
    console.log();
  }
  console.log(
    "Agents can use these signals via the 'get-community-signals' MCP tool",
  );
  console.log("and propose challenges via the 'propose-challenge' MCP tool.");
}

console.log("\nDone!");
process.exit(0);
