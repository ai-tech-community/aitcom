import type { PublicEventCard } from "./public-events";

/**
 * Verified public events only. Never invent dates, URLs, or attendance.
 * World Summit AI Amsterdam 2026 is already listed on AIT and on
 * https://worldsummit.ai/ (7–8 October 2026, Amsterdam / Zaandam).
 */
export const CURATED_PUBLIC_EVENT_SEEDS: Array<
  Omit<PublicEventCard, "source">
> = [
  {
    id: "world-summit-ai-amsterdam-2026",
    title: "World Summit AI Amsterdam 2026",
    date: "2026-10-07",
    online: false,
    city: "Amsterdam",
    url: "https://worldsummit.ai/",
    why: {
      en: "Flagship global AI summit in the Netherlands for builders to track.",
      nl: "Toonaangevende wereldwijde AI-top in Nederland voor bouwers.",
    },
  },
];

export function curatedPublicEventCards(): PublicEventCard[] {
  return CURATED_PUBLIC_EVENT_SEEDS.map((seed) => ({
    ...seed,
    source: "curated" as const,
  }));
}
