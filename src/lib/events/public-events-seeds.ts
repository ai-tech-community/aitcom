import type { PublicEventCard } from "./public-events";

/**
 * Verified public events only. Never invent dates, URLs, end dates, or
 * attendance. World Summit AI Amsterdam 2026 stays on
 * https://worldsummit.ai/ (7–8 October 2026, Amsterdam / Zaandam).
 * Weekday +5 rows use official start dates only.
 */
export const CURATED_PUBLIC_EVENT_SEEDS: Array<
  Omit<PublicEventCard, "source">
> = [
  {
    id: "ai-summit-barcelona-2026",
    title: "AI Summit Barcelona",
    date: "2026-09-22",
    online: false,
    city: "Barcelona",
    url: "https://aisummitbarcelona.com/",
    why: {
      en: "Europe AI Week flagship: talks, demos, and a city full of side events.",
      nl: "Vlaggenschip van Europe AI Week: talks, demo's en een stad vol side-events.",
    },
  },
  {
    id: "lisbon-ai-2026",
    title: "Lisbon AI",
    date: "2026-09-23",
    online: false,
    city: "Lisbon",
    url: "https://lisbonai.org/",
    why: {
      en: "Builder summit for people shipping production AI (talks + hallway hacking).",
      nl: "Builder-summit voor wie productie-AI shipped (talks + hallway hacking).",
    },
  },
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
  {
    id: "ai-engineer-new-york-2026",
    title: "AI Engineer New York",
    date: "2026-10-12",
    online: false,
    city: "New York",
    url: "https://www.ai.engineer/nyc/2026",
    why: {
      en: "High-signal production AI engineering conference with a finance/enterprise track.",
      nl: "Hoog-signaal productie-AI-engineeringconferentie met finance/enterprise-track.",
    },
  },
  {
    id: "nvidia-gtc-berlin-2026",
    title: "NVIDIA GTC Berlin",
    date: "2026-10-20",
    online: false,
    city: "Berlin",
    url: "https://www.nvidia.com/en-eu/gtc/",
    why: {
      en: "Europe GTC: full AI stack sessions, workshops, Jensen keynote at Tempodrom.",
      nl: "Europa-GTC: sessies over de hele AI-stack, workshops, Jensen-keynote in Tempodrom.",
    },
  },
  {
    id: "ai-engineer-code-summit-2026",
    title: "AI Engineer CODE Summit",
    date: "2026-11-10",
    online: false,
    city: "San Francisco",
    url: "https://www.ai.engineer/code/2026",
    why: {
      en: "Application-only summit on coding agents, evals, and production agent workflows.",
      nl: "Summit alleen over applicaties: coding agents, evals en productie-agentworkflows.",
    },
  },
];

export const CURATED_PUBLIC_EVENT_WEEKDAY_IDS = [
  "ai-summit-barcelona-2026",
  "lisbon-ai-2026",
  "ai-engineer-new-york-2026",
  "nvidia-gtc-berlin-2026",
  "ai-engineer-code-summit-2026",
] as const;

export function curatedPublicEventCards(): PublicEventCard[] {
  return CURATED_PUBLIC_EVENT_SEEDS.map((seed) => ({
    ...seed,
    source: "curated" as const,
  }));
}
