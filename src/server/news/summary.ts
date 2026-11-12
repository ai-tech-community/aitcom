import {
  completeChat,
  inferenceApiKey,
  newsSummaryModel,
} from "@/server/inference/openai-compatible";

const SUMMARY_MAX = 240;

export type NewsSummaryInput = {
  title: string;
  summary: string;
};

export type NewsSummarizer = (
  input: NewsSummaryInput,
) => Promise<string | null>;

export function clampNewsSummary(value: string, max = SUMMARY_MAX): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A summary to store for a new story, or null when nothing was written.
 * Null leaves the column empty so a later ingest can try again. Send time
 * must not call this.
 */
export async function generateNewsSummary(
  input: NewsSummaryInput,
): Promise<string | null> {
  if (!inferenceApiKey()) return null;
  try {
    const written = (
      await completeChat({
        model: newsSummaryModel(),
        temperature: 0,
        maxTokens: 1024,
        title: "AIT News Summary",
        messages: [
          {
            role: "user",
            content: `Write a 1-2 sentence TL;DR of this technology or business news item. No greeting. Plain text.\nTitle: ${input.title}\nExcerpt: ${input.summary}`,
          },
        ],
      })
    ).trim();
    return written ? clampNewsSummary(written) : null;
  } catch (err) {
    console.error("news: could not write a summary", err);
    return null;
  }
}
