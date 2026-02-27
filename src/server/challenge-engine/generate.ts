/**
 * AI Challenge Generation Service
 *
 * Takes community signals and uses the Anthropic Claude API to generate
 * structured challenge data for the AIT Community platform.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ChallengeSignal } from "./signals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedChallenge {
  title: string;
  slug: string;
  description: string; // Plain text, will be converted to Lexical later
  type: "weekly" | "monthly" | "open-ended";
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  collaborationModel: "solo-ai";
  objectives: Array<{
    description: string;
    verification: "self-report" | "platform-action" | "peer-review";
    action?:
      | "thread.reply"
      | "thread.create"
      | "knowledge.share"
      | "idea.submitted"
      | "idea.voted";
    targetCount: number;
  }>;
  tags: string[];
  signalSource: {
    type: ChallengeSignal["type"];
    reference: string;
    summary: string;
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a challenge designer for the AIT Community — a Dutch AI & automation community platform where members learn, experiment, and collaborate on AI topics.

Your job is to generate engaging, well-structured community challenges based on community signals (trending topics, member requests, activity patterns, and insight gaps).

Follow these rules strictly:

1. ACHIEVABILITY — Challenges must be completable within their timeframe:
   - "weekly" challenges should take 1-5 hours of focused work.
   - "monthly" challenges can be more ambitious but still achievable part-time.
   - "open-ended" challenges have no deadline but should have clear milestones.

2. CONCRETE OBJECTIVES — Every objective must be specific and verifiable:
   - Use "platform-action" verification when an objective maps to a measurable platform action (thread.reply, thread.create, knowledge.share, idea.submitted, idea.voted).
   - Use "peer-review" for subjective or creative deliverables that need human evaluation.
   - Use "self-report" only when other modes are not applicable.
   - Each objective needs a realistic targetCount (usually 1-3 for weekly, 1-5 for monthly).

3. SOLO+AI COLLABORATION — Challenges follow the Solo+AI model:
   - Encourage members to leverage AI tools (like Claude, ChatGPT, GitHub Copilot, etc.) as part of their workflow.
   - Frame objectives around what a human can achieve WITH AI assistance.
   - The collaborationModel must always be "solo-ai".

4. DIFFICULTY — Assign an appropriate difficulty level:
   - "beginner": No prior AI/automation experience required.
   - "intermediate": Assumes basic familiarity with AI concepts and tools.
   - "advanced": Requires hands-on experience with AI/automation workflows.
   - "expert": For seasoned practitioners pushing boundaries.

5. TITLES — Keep titles concise (max ~60 characters), action-oriented, and exciting. Use verbs that inspire (Build, Explore, Design, Automate, etc.).

6. DESCRIPTIONS — Explain the "why" behind the challenge. Describe what members will learn or achieve, and why it matters for their AI journey. Write 2-4 paragraphs of plain text.

7. SLUGS — Generate a URL-friendly slug from the title: lowercase, hyphens instead of spaces, no special characters, max 80 characters.

8. TAGS — Include 2-5 relevant tags (lowercase, hyphenated). Examples: "ai-automation", "prompt-engineering", "no-code", "machine-learning", "community-building".

9. SIGNAL SOURCE — Include the top signal that inspired this challenge in the signalSource field, using the signal's type, reference, and summary.

10. UNIQUENESS — The challenge must NOT duplicate any of the existing challenge titles provided.

Output ONLY valid JSON matching the GeneratedChallenge schema. No markdown, no code fences, no explanation — just the raw JSON object.`;

// ---------------------------------------------------------------------------
// Generation function
// ---------------------------------------------------------------------------

/**
 * Generate a new community challenge from community signals using Claude.
 *
 * @param signals    - Ranked community signals (highest relevance first).
 * @param existingChallengeTitles - Titles of existing challenges to avoid duplicates.
 * @returns A structured `GeneratedChallenge` ready for review and publishing.
 */
export async function generateChallenge(
  signals: ChallengeSignal[],
  existingChallengeTitles: string[],
): Promise<GeneratedChallenge> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for challenge generation");
  }

  const client = new Anthropic();

  // Take top 10 signals for the prompt context.
  const topSignals = signals.slice(0, 10);

  const userPrompt = buildUserPrompt(topSignals, existingChallengeTitles);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract text content from the response.
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      "Challenge generation failed: Claude returned no text content in the response.",
    );
  }

  const rawText = textBlock.text.trim();

  // Parse JSON from the response.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (parseError) {
    throw new Error(
      `Challenge generation failed: Claude returned invalid JSON.\n` +
        `Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}\n` +
        `Raw response (first 500 chars): ${rawText.slice(0, 500)}`,
    );
  }

  const challenge = parsed as GeneratedChallenge;

  // Enforce collaborationModel = "solo-ai" (Phase 1 only).
  challenge.collaborationModel = "solo-ai";

  return challenge;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildUserPrompt(
  signals: ChallengeSignal[],
  existingTitles: string[],
): string {
  const signalLines = signals
    .map(
      (s, i) =>
        `${i + 1}. [${s.type}] (relevance: ${s.relevanceScore.toFixed(2)}) ${s.summary}\n   Reference: ${s.reference}`,
    )
    .join("\n");

  const existingTitlesList =
    existingTitles.length > 0
      ? existingTitles.map((t) => `- ${t}`).join("\n")
      : "(none yet)";

  return `Generate a single community challenge based on the following community signals.

## Community Signals (ranked by relevance)

${signalLines}

## Existing Challenge Titles (avoid duplicates)

${existingTitlesList}

Generate the challenge JSON now.`;
}
