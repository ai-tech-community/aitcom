import { z } from "zod";

import { newsArticleUrl } from "@/server/news/draft";

export const STORY_SUGGESTION_LIMIT = 5;
export const STORY_SUGGESTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_STORY_LENGTH = 8;

export const storySuggestionInputSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export type StorySuggestionInput = z.infer<typeof storySuggestionInputSchema>;

export type NormalizedStorySuggestion = {
  body: string;
  url: string | null;
};

function looksLikeUrl(text: string): boolean {
  return (
    /^(https?:\/\/|www\.)/i.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
  );
}

/**
 * A source link must be a valid https URL. Anything else is a story
 * suggestion and needs a few words. The stored text is the member's own.
 */
export function normalizeStorySuggestion(
  raw: string,
):
  | { ok: true; value: NormalizedStorySuggestion }
  | { ok: false; reason: "url" | "short" } {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text.length > 500) return { ok: false, reason: "short" };
  if (looksLikeUrl(text)) {
    const candidate = /^www\./i.test(text) ? `https://${text}` : text;
    const url = newsArticleUrl(candidate);
    if (!url?.startsWith("https://")) return { ok: false, reason: "url" };
    return { ok: true, value: { body: url, url } };
  }
  if (text.length < MIN_STORY_LENGTH) return { ok: false, reason: "short" };
  return { ok: true, value: { body: text, url: null } };
}

export function suggestionRateDecision(recentCount: number): "ok" | "limited" {
  return recentCount >= STORY_SUGGESTION_LIMIT ? "limited" : "ok";
}

export function suggestionWindowStart(now: Date): Date {
  return new Date(now.getTime() - STORY_SUGGESTION_WINDOW_MS);
}

export type StorySuggestionWrite = {
  countRecent(userId: string, since: Date): Promise<number>;
  insert(row: {
    userId: string;
    body: string;
    url: string | null;
  }): Promise<string>;
};

export type SubmitStorySuggestionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "limited" };

export async function submitStorySuggestion(
  store: StorySuggestionWrite,
  args: {
    userId: string;
    value: NormalizedStorySuggestion;
    now: Date;
  },
): Promise<SubmitStorySuggestionResult> {
  const recent = await store.countRecent(
    args.userId,
    suggestionWindowStart(args.now),
  );
  if (suggestionRateDecision(recent) === "limited") {
    return { ok: false, reason: "limited" };
  }
  const id = await store.insert({
    userId: args.userId,
    body: args.value.body,
    url: args.value.url,
  });
  return { ok: true, id };
}
