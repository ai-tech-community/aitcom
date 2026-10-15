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

type AnthropicMessage = {
  content?: Array<{ type?: string; text?: string }>;
};

async function requestAnthropicSummary(
  key: string,
  input: NewsSummaryInput,
): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Write a 1-2 sentence TL;DR of this technology or business news item. No greeting. Plain text.\nTitle: ${input.title}\nExcerpt: ${input.summary}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`The summary model answered with status ${res.status}.`);
  }
  const body = (await res.json()) as AnthropicMessage;
  const text = body.content?.find((block) => block.type === "text")?.text;
  const written = text?.trim();
  if (!written) return null;
  return written;
}

/**
 * A summary to store for a new story, or null when nothing was written.
 * Null leaves the column empty so a later ingest can try again. Send time
 * must not call this.
 */
export async function generateNewsSummary(
  input: NewsSummaryInput,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  try {
    const written = await requestAnthropicSummary(key, input);
    return written ? clampNewsSummary(written) : null;
  } catch (err) {
    console.error("news: could not write a summary", err);
    return null;
  }
}
