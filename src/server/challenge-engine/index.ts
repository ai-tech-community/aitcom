export { collectSignals, type ChallengeSignal, type SignalType } from "./signals";
export { generateChallenge, type GeneratedChallenge } from "./generate";
export { publishChallenge } from "./publish";
export { plainTextToLexical, lexical, paragraph, text, heading, bulletList, hr } from "./lexical";

import { collectSignals } from "./signals";
import { generateChallenge } from "./generate";
import { publishChallenge } from "./publish";
import { getPayloadClient } from "@/server/payload";

export interface EngineResult {
  signals: number;
  generated: {
    title: string;
    slug: string;
    difficulty: string;
    type: string;
  } | null;
  published: { id: number; slug: string } | null;
  error?: string;
}

/**
 * Run the full challenge engine pipeline:
 * 1. Collect signals from community activity
 * 2. Generate a challenge using AI
 * 3. Publish it to the platform
 */
export async function runChallengeEngine(
  options: { autoPublish?: boolean; dayWindow?: number } = {},
): Promise<EngineResult> {
  const { autoPublish = false, dayWindow = 14 } = options;

  // 1. Collect signals
  const signals = await collectSignals(dayWindow);

  if (signals.length === 0) {
    return { signals: 0, generated: null, published: null, error: "No signals found" };
  }

  // 2. Get existing challenge titles to avoid duplicates
  const payload = await getPayloadClient();
  const { docs: existingChallenges } = await payload.find({
    collection: "challenges",
    where: {
      status: { in: ["active", "draft"] },
    },
    limit: 100,
    depth: 0,
  });
  const existingTitles = existingChallenges.map((c) => c.title);

  // 3. Generate
  const generated = await generateChallenge(signals, existingTitles);

  // 4. Publish
  const published = await publishChallenge(generated, {
    status: autoPublish ? "active" : "draft",
  });

  return {
    signals: signals.length,
    generated: {
      title: generated.title,
      slug: generated.slug,
      difficulty: generated.difficulty,
      type: generated.type,
    },
    published,
  };
}
