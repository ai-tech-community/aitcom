const SUMMARY_MAX = 240;

export type NewsSummaryInput = {
  title: string;
  summary: string;
};

export type NewsSummarizer = (input: NewsSummaryInput) => Promise<string>;

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
      model: "claude-3-5-haiku-latest",
      max_tokens: 160,
      messages: [
        {
          role: "user",
          content: `Write a 1-2 sentence TL;DR of this AI news item. No greeting. Plain text.\nTitle: ${input.title}\nExcerpt: ${input.summary}`,
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
 * One summary for a story that is being stored. With no key, or if the model
 * fails, the feed excerpt is stored instead. Callers must not use this at
 * send time.
 */
export async function generateNewsSummary(
  input: NewsSummaryInput,
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (key) {
    try {
      const written = await requestAnthropicSummary(key, input);
      if (written) return clampNewsSummary(written);
    } catch (err) {
      console.error("news: could not write a summary", err);
    }
  }
  const fallback = input.summary.trim() || input.title.trim();
  return clampNewsSummary(fallback);
}
