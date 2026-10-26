import { z } from "zod";

/** Builder fields shared by every item kind. */
export const itemBaseInput = {
  id: z.string().optional(),
  intro: z.string().max(280).optional(),
};

export function storedIntro(intro: string | undefined): string | null {
  const trimmed = intro?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

export function introInput(stored: string | null | undefined): {
  intro?: string;
} {
  return stored ? { intro: stored } : {};
}

/** Plain-text excerpt, with an ellipsis only when words were left out. */
export function cutWords(text: string, words: number): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length > words
    ? `${parts.slice(0, words).join(" ")}…`
    : parts.join(" ");
}
