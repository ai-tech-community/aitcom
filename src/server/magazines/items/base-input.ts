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

export { cutWords } from "@/lib/magazines/teaser";
