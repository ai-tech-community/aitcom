/**
 * Ops-cleared public events for the fat `/events` listing (Payload `events`).
 *
 * Facts only: official title, start date, city, venue when named, and URL.
 * Date ranges live in the summary. There is no end-date column. No attendance,
 * RSVP, price, or image. The collection has no conference type; these rows use
 * `meetup`, the same label the World Summit guide already uses for that summit.
 */
export const BUILDER_PUBLIC_EVENTS_SEEDED_AT = "2026-09-25T12:00:00.000Z";

export type BuilderPublicEvent = {
  slug: string;
  title: string;
  /** Start date (YYYY-MM-DD). The listing sorts on this. */
  date: string;
  city: string;
  country: string;
  location: string;
  timezone: string;
  url: string;
  summary: { en: string; nl: string };
};

export const BUILDER_PUBLIC_EVENTS: readonly BuilderPublicEvent[] = [
  {
    slug: "the-ai-conference-2026",
    title: "The AI Conference 2026",
    date: "2026-09-29",
    city: "San Francisco",
    country: "United States",
    location: "Pier 48, San Francisco",
    timezone: "America/Los_Angeles",
    url: "https://aiconference.com/",
    summary: {
      en: "Multi-day applied-AI builders at Pier 48 (Day ZERØ + two conference days), 29 Sep–1 Oct 2026.",
      nl: "Meerdere dagen applied-AI-bouwers op Pier 48 (Day ZERØ + twee conferentiedagen), 29 sep–1 okt 2026.",
    },
  },
  {
    slug: "world-summit-ai-amsterdam-2026",
    title: "World Summit AI Amsterdam 2026",
    date: "2026-10-07",
    city: "Amsterdam",
    country: "Netherlands",
    location: "Taets Art & Event Park, Amsterdam",
    timezone: "Europe/Amsterdam",
    url: "https://worldsummit.ai/",
    summary: {
      en: "Flagship EU summit during World AI Week, 7–8 Oct 2026, Taets Art & Event Park.",
      nl: "Vlaggenschip-EU-top tijdens World AI Week, 7–8 okt 2026, Taets Art & Event Park.",
    },
  },
  {
    slug: "ai-engineer-new-york-2026",
    title: "AI Engineer New York 2026",
    date: "2026-10-12",
    city: "New York",
    country: "United States",
    location: "New York",
    timezone: "America/New_York",
    url: "https://ai.engineer/nyc/2026",
    summary: {
      en: "Production AI engineering, finance and systems focus, 12–14 Oct 2026.",
      nl: "Productie-AI-engineering, focus op finance en systems, 12–14 okt 2026.",
    },
  },
  {
    slug: "nvidia-gtc-berlin-2026",
    title: "NVIDIA GTC Berlin 2026",
    date: "2026-10-20",
    city: "Berlin",
    country: "Germany",
    location: "Tempodrom + STATION-Berlin",
    timezone: "Europe/Berlin",
    url: "https://www.nvidia.com/en-eu/gtc/",
    summary: {
      en: "European GTC at Tempodrom and STATION-Berlin, 20–22 Oct 2026.",
      nl: "Europese GTC in Tempodrom en STATION-Berlin, 20–22 okt 2026.",
    },
  },
  {
    slug: "pytorch-conference-north-america-2026",
    title: "PyTorch Conference North America 2026",
    date: "2026-10-20",
    city: "San Jose",
    country: "United States",
    location: "San Jose Convention Center, San Jose",
    timezone: "America/Los_Angeles",
    url: "https://events.linuxfoundation.org/pytorch-conference-north-america/",
    summary: {
      en: "PyTorch Foundation conference at San Jose Convention Center, 20–21 Oct 2026.",
      nl: "PyTorch Foundation-conferentie in het San Jose Convention Center, 20–21 okt 2026.",
    },
  },
  {
    slug: "aixia-2026",
    title: "AIxIA 2026",
    date: "2026-10-22",
    city: "Strasbourg",
    country: "France",
    location: "Palais de la Musique et des Congrès, Strasbourg",
    timezone: "Europe/Paris",
    url: "https://aixia.eu/en/home",
    summary: {
      en: "Franco-German AI conference in Strasbourg, 22 Oct 2026.",
      nl: "Frans-Duitse AI-conferentie in Straatsburg, 22 okt 2026.",
    },
  },
  {
    slug: "tedai-2026",
    title: "TEDAI 2026",
    date: "2026-10-28",
    city: "Vienna",
    country: "Austria",
    location: "Vienna",
    timezone: "Europe/Vienna",
    url: "https://tedai-vienna.ted.com/",
    summary: {
      en: "Official TED AI in Vienna: talks, discovery day, and community, 28–30 Oct 2026.",
      nl: "Officiële TED AI in Wenen: talks, discovery day en community, 28–30 okt 2026.",
    },
  },
  {
    slug: "web-summit-2026",
    title: "Web Summit 2026",
    date: "2026-11-09",
    city: "Lisbon",
    country: "Portugal",
    location: "MEO Arena, Lisbon",
    timezone: "Europe/Lisbon",
    url: "https://websummit.com/web-summit-2026/",
    summary: {
      en: "Web Summit at MEO Arena in Lisbon, 9–12 Nov 2026.",
      nl: "Web Summit in de MEO Arena in Lissabon, 9–12 nov 2026.",
    },
  },
] as const;

export function builderEventDescription(
  summary: string,
  url: string,
  pageLabel: string,
) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      children: [
        {
          type: "paragraph",
          version: 1,
          format: "",
          indent: 0,
          direction: "ltr" as const,
          children: [
            {
              type: "text",
              version: 1,
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: `${summary} ${pageLabel} ${url}`,
            },
          ],
        },
      ],
    },
  };
}
