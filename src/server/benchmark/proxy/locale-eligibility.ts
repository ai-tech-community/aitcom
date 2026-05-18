import type { ModelSurface } from "@/server/db/schema";

/**
 * Per-surface allowed prompt locales. Auto-seed and the assignment router
 * intersect a prompt's locale with the surface's allowed set; surfaces
 * outside the set are not seeded for that prompt. See ADR-0001.
 *
 * Conservative defaults — extend when a surface is verified to handle a
 * locale well. Locale tags follow IETF BCP-47 form (`en-US`, `de-DE`).
 */
const ALLOWED_LOCALES: Partial<Record<ModelSurface, ReadonlySet<string>>> = {
  chatgpt_grounded: new Set([
    "en-US",
    "en-GB",
    "de-DE",
    "fr-FR",
    "es-ES",
    "it-IT",
    "nl-NL",
    "pt-BR",
    "pt-PT",
    "ja-JP",
  ]),
};

export function surfaceAllowsLocale(
  surface: ModelSurface,
  locale: string,
): boolean {
  return ALLOWED_LOCALES[surface]?.has(locale) ?? false;
}

export function surfacesForLocale(
  candidates: readonly ModelSurface[],
  locale: string,
): ModelSurface[] {
  return candidates.filter((s) => surfaceAllowsLocale(s, locale));
}
