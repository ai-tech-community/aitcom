"use client";

// PROTOTYPE — throwaway. Full-width desktop layouts for the community pages,
// switchable with `?variant=` on any /communities/<slug> route.
// "Four variants of the community frame + overview, on the existing routes."

import { useSearchParams } from "next/navigation";

export const COMMUNITY_LAYOUT_VARIANTS = [
  { key: "A", name: "Today (1024px column)" },
  { key: "B", name: "Identity rail (3 columns)" },
  { key: "C", name: "Wide frame, top tabs" },
  { key: "D", name: "Feed + board" },
] as const;

export type CommunityLayoutVariantKey =
  (typeof COMMUNITY_LAYOUT_VARIANTS)[number]["key"];

export function useCommunityLayoutPrototype(): CommunityLayoutVariantKey {
  const raw = useSearchParams().get("variant");
  if (process.env.NODE_ENV === "production") return "A";
  return COMMUNITY_LAYOUT_VARIANTS.some((v) => v.key === raw)
    ? (raw as CommunityLayoutVariantKey)
    : "A";
}

/** Keeps the chosen variant when moving between community tabs. */
export function withVariant(href: string, variant: string): string {
  return variant === "A" ? href : `${href}?variant=${variant}`;
}
