import type { EventType } from "@/lib/event-metadata";

/**
 * Ops-cleared public events for the fat `/events` listing (Payload `events`).
 *
 * Facts only: official title, start date, city, venue when named, and URL.
 * `endDate` is the official last day, including a one-day event whose last
 * day is the start day, so Event JSON-LD can carry both startDate and
 * endDate. Summaries are what, when, and where only. No attendance, RSVP,
 * or image. `priceCents` is set only when the official page states one
 * ticket price. `type` follows the title and summary (`inferEventType`):
 * a conference, summit, congress, expo, fair, symposium, or named flagship
 * such as Slush is `conference`, and a hack day is `hackathon`. The enum has
 * no fair or expo value, so a fair is a conference. `isAi` is separate.
 */

export const BUILDER_PUBLIC_EVENTS_SEEDED_AT = "2026-09-25T12:00:00.000Z";

export type BuilderPublicEvent = {
  slug: string;
  title: string;
  type: EventType;
  /** Start date (YYYY-MM-DD). The listing sorts on this. */
  date: string;
  /** Last calendar day (YYYY-MM-DD), when the official span is longer than one day. */
  endDate?: string;
  city: string;
  country: string;
  location: string;
  timezone: string;
  url: string;
  /**
   * Card line: what, when, and where. The public meta description is built
   * separately as "<name>. <date range>. <venue, city>."
   */
  summary: { en: string; nl: string };
  /** Official ticket price in EUR cents, when the page states one price. */
  priceCents?: number;
  /** YYYY-MM-DD the official page says registration closes. */
  registrationDeadline?: string;
  /** Wall clock HH:MM in `timezone`, when the official page states it. */
  startTime?: string;
  endTime?: string;
  /**
   * Stored `events.is_ai` when the listing should not wait for the
   * classifier. Omitted rows stay null.
   */
  isAi?: boolean;
};

export const BUILDER_PUBLIC_EVENTS: readonly BuilderPublicEvent[] = [
  {
    slug: "the-ai-conference-2026",
    title: "The AI Conference 2026",
    type: "conference",
    date: "2026-09-29",
    endDate: "2026-10-01",
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
    type: "conference",
    date: "2026-10-07",
    endDate: "2026-10-08",
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
    slug: "boston-openclaw-meetup-2026",
    title: "Boston OpenClaw meetup",
    type: "meetup",
    date: "2026-10-08",
    city: "Cambridge",
    country: "United States",
    location: "Microsoft NERD, Cambridge",
    timezone: "America/New_York",
    url: "https://aiweek.boston/schedule/boston-openclaw-meetup",
    summary: {
      en: "Personal-agent meetup at Microsoft NERD, Cambridge, Thu 8 Oct 2026, 6:00–8:00 PM ET.",
      nl: "Meetup over persoonlijke agents bij Microsoft NERD in Cambridge, do 8 okt 2026, 18:00–20:00 ET.",
    },
  },
  {
    slug: "ai-engineer-new-york-2026",
    title: "AI Engineer New York 2026",
    type: "conference",
    date: "2026-10-12",
    endDate: "2026-10-14",
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
    slug: "techex-amsterdam-hackathon-2026",
    title: "TechEx Amsterdam Hackathon",
    type: "conference",
    date: "2026-10-16",
    city: "Amsterdam",
    country: "Netherlands",
    location: "RAI Amsterdam",
    timezone: "Europe/Amsterdam",
    url: "https://lablab.ai/ai-hackathons/techex-amsterdam-hackathon",
    summary: {
      en: "Official AI & Big Data Expo Europe hackathon with lablab.ai: build online from 16 Oct 2026, then finish on-site at RAI Amsterdam.",
      nl: "Officiële AI & Big Data Expo Europe-hackathon met lablab.ai: online bouwen vanaf 16 okt 2026, daarna afronden op locatie in RAI Amsterdam.",
    },
  },
  {
    slug: "nvidia-gtc-berlin-2026",
    title: "NVIDIA GTC Berlin 2026",
    type: "conference",
    date: "2026-10-20",
    endDate: "2026-10-22",
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
    type: "conference",
    date: "2026-10-20",
    endDate: "2026-10-21",
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
    type: "conference",
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
    slug: "agentic-ai-in-the-wild-2026",
    title: "Agentic AI in the Wild: Open Source Agents in Production",
    type: "meetup",
    date: "2026-10-22",
    city: "New York",
    country: "United States",
    location: "New York",
    timezone: "America/New_York",
    url: "https://luma.com/l7dhbis5",
    summary: {
      en: "Meetup on open-source agents in production, New York, Thu 22 Oct 2026, 5:00–8:00 PM ET.",
      nl: "Meetup over open-source agents in productie, New York, do 22 okt 2026, 17:00–20:00 ET.",
    },
  },
  {
    slug: "hacktoberfest-hack-day-barcelona-2026",
    title: "Hacktoberfest Hack Day Barcelona",
    type: "hackathon",
    date: "2026-10-24",
    city: "Barcelona",
    country: "Spain",
    location: "Edifici Colom, Barcelona",
    timezone: "Europe/Madrid",
    url: "https://events.mlh.com/events/14748-hacktoberfest-hack-day-barcelona",
    summary: {
      en: "One-day Hacktoberfest hack day on open-source AI at Edifici Colom, Barcelona, Sat 24 Oct 2026.",
      nl: "Eendaagse Hacktoberfest-hackday over open-source AI in Edifici Colom, Barcelona, za 24 okt 2026.",
    },
  },
  {
    slug: "tedai-2026",
    title: "TEDAI 2026",
    type: "conference",
    date: "2026-10-28",
    endDate: "2026-10-30",
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
    slug: "iamexpat-fair-the-hague-2026",
    title: "IamExpat Fair The Hague",
    type: "conference",
    date: "2026-11-07",
    endDate: "2026-11-07",
    startTime: "10:00",
    endTime: "17:00",
    city: "The Hague",
    country: "Netherlands",
    location: "Grote Kerk, Rond de Grote Kerk 12, The Hague",
    timezone: "Europe/Amsterdam",
    url: "https://www.iamexpat.nl/lifestyle/events-festivals-netherlands/iamexpat-fair-the-hague",
    isAi: false,
    summary: {
      en: "Expat fair at the Grote Kerk, The Hague, Sat 7 Nov 2026, 10:00–17:00.",
      nl: "Expatsbeurs in de Grote Kerk, Den Haag, za 7 nov 2026, 10:00–17:00.",
    },
  },
  {
    slug: "web-summit-2026",
    title: "Web Summit 2026",
    type: "conference",
    date: "2026-11-09",
    endDate: "2026-11-12",
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
  {
    slug: "slush-2026",
    title: "Slush 2026",
    type: "conference",
    date: "2026-11-18",
    endDate: "2026-11-19",
    city: "Helsinki",
    country: "Finland",
    location: "Messukeskus, Messuaukio 1, Helsinki",
    timezone: "Europe/Helsinki",
    url: "https://slush.org/faq",
    isAi: false,
    summary: {
      en: "Startup event at Messukeskus, Helsinki, 18–19 Nov 2026, with Day 0 on 17 Nov.",
      nl: "Startup-evenement in Messukeskus, Helsinki, 18–19 nov 2026, met Day 0 op 17 nov.",
    },
  },
  {
    slug: "ai-europe-congress-2026",
    title: "AI Europe Congress 2026",
    type: "conference",
    date: "2026-11-19",
    endDate: "2026-11-19",
    city: "Warsaw",
    country: "Poland",
    location: "BEC Financial Technologies office, ul. Emilii Plater 53, Warsaw",
    timezone: "Europe/Warsaw",
    url: "https://aieuropecongress.pl/",
    isAi: true,
    summary: {
      en: "AI conference at the BEC Financial Technologies office, ul. Emilii Plater 53, Warsaw, Thu 19 Nov 2026.",
      nl: "AI-conferentie bij BEC Financial Technologies, ul. Emilii Plater 53, Warschau, do 19 nov 2026.",
    },
  },
  {
    slug: "ukairs-2026",
    title: "UKAIRS 2026",
    type: "conference",
    date: "2026-11-24",
    endDate: "2026-11-25",
    city: "Edinburgh",
    country: "United Kingdom",
    location: "John McIntyre Conference Centre, 18 Holyrood Park Rd, Edinburgh",
    timezone: "Europe/London",
    url: "https://www.ukairs.ac.uk/Home/Welcome",
    registrationDeadline: "2026-11-10",
    isAi: true,
    summary: {
      en: "UK AI Research Symposium at the John McIntyre Conference Centre, Edinburgh, 24–25 Nov 2026.",
      nl: "UK AI Research Symposium in het John McIntyre Conference Centre, Edinburgh, 24–25 nov 2026.",
    },
  },
  {
    slug: "llmday-london-2026",
    title: "LLMday London",
    type: "conference",
    date: "2026-11-26",
    city: "London",
    country: "United Kingdom",
    location: "Everyman Canary Wharf, London",
    timezone: "Europe/London",
    url: "https://llmday.com/2026-london-q4/index.html",
    summary: {
      en: "Conference on large language models, agents and AI systems at Everyman Canary Wharf, London, Thu 26 Nov 2026.",
      nl: "Conferentie over large language models, agents en AI-systemen in Everyman Canary Wharf, Londen, do 26 nov 2026.",
    },
  },
  {
    slug: "ai-hpi-conference-2026",
    title: "AI@HPI Conference 2026",
    type: "conference",
    date: "2026-12-02",
    endDate: "2026-12-03",
    city: "Potsdam",
    country: "Germany",
    location: "Hasso Plattner Institute, Potsdam",
    timezone: "Europe/Berlin",
    url: "https://hpi.de/en/ai-hpi-conference/",
    priceCents: 29000,
    isAi: true,
    summary: {
      en: "AI conference at the Hasso Plattner Institute, Potsdam, 2–3 Dec 2026.",
      nl: "AI-conferentie aan het Hasso Plattner Institute, Potsdam, 2–3 dec 2026.",
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
