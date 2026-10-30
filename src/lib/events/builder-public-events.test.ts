import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { upsertBuilderEvent } from "../../migrations/20260925a_builder_public_events";
import { eventMetaDescription } from "./listing-policy";
import { publishedEventsVisibleWhere } from "./public-event-access";
import { PUBLIC_EVENTS_WHY_MAX } from "./public-events";
import {
  BUILDER_PUBLIC_EVENTS,
  builderEventDescription,
} from "./builder-public-events";

const dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  dir,
  "../../migrations/20260925a_builder_public_events.ts",
);
const TEDAI_MIGRATION = join(dir, "../../migrations/20260925b_tedai_vienna.ts");
const OCTOBER_MIGRATION = join(
  dir,
  "../../migrations/20261005a_pytorch_aixia_web_summit.ts",
);
const FIVE_EVENTS_MIGRATION = join(
  dir,
  "../../migrations/20261006a_five_public_events.ts",
);
const NOVEMBER_MIGRATION = join(
  dir,
  "../../migrations/20261019a_five_public_events.ts",
);
const TEN_EVENTS_MIGRATION = join(
  dir,
  "../../migrations/20261021a_ten_public_events.ts",
);
const SEVEN_EVENTS_MIGRATION = join(
  dir,
  "../../migrations/20261022a_seven_public_events.ts",
);
const SIX_EVENTS_MIGRATION = join(
  dir,
  "../../migrations/20261023a_six_public_events.ts",
);
const MIGRATION_INDEX = join(dir, "../../migrations/index.ts");
const EVENTS_PAGE = join(dir, "../../app/[locale]/events/page.tsx");

const COUNT_COPY =
  /\b(\d+|no)\s+(attendees?|RSVPs?|spots?(?:\s+left)?|registrations?)\b/i;

/** Static SQL text from a Drizzle `sql` query, without bound parameters. */
function staticSql(query: unknown): string {
  const chunks =
    (query as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object" || !("value" in chunk)) {
        return "";
      }
      const value = (chunk as { value: unknown }).value;
      if (
        Array.isArray(value) &&
        value.every((part) => typeof part === "string")
      ) {
        return value.join("");
      }
      return "";
    })
    .join("");
}

describe("builder public events", () => {
  it("lands the ops-cleared events in start-date order", () => {
    expect(BUILDER_PUBLIC_EVENTS.map((event) => event.slug)).toEqual([
      "the-ai-conference-2026",
      "world-summit-ai-amsterdam-2026",
      "boston-openclaw-meetup-2026",
      "ai-engineer-new-york-2026",
      "techex-amsterdam-hackathon-2026",
      "nvidia-gtc-berlin-2026",
      "pytorch-conference-north-america-2026",
      "aixia-2026",
      "agentic-ai-in-the-wild-2026",
      "hacktoberfest-hack-day-barcelona-2026",
      "tedai-2026",
      "ai-devcon-nyc-2026",
      "agentic-transformation-summit-amsterdam-2026",
      "the-amsterdam-ai-summit-2026",
      "iamexpat-fair-the-hague-2026",
      "web-summit-2026",
      "ai-engineering-summit-austin-2026",
      "say-hello-eindhoven-2026",
      "tedxamsterdam-2026",
      "siai-2026",
      "kvk-ondernemersdagen-2026",
      "ai-data-science-day-2026",
      "sinterklaasintocht-amsterdam-2026",
      "ai-coding-summit-nyc-2026",
      "handelsblatt-ai-summit-2026",
      "microsoft-ignite-2026",
      "slush-2026",
      "ai-europe-congress-2026",
      "dsc-europe-2026",
      "expatise-income-tax-utrecht-2026",
      "ukairs-2026",
      "big-data-conference-europe-2026",
      "ae-global-summit-2026",
      "data-science-summit-warsaw-2026",
      "llmday-london-2026",
      "welcome-to-the-hague-2026",
      "aws-reinvent-2026",
      "generative-ai-summit-london-2026",
      "apidays-paris-2026",
      "ai-hpi-conference-2026",
      "the-ai-summit-new-york-2026",
    ]);
    const dates = BUILDER_PUBLIC_EVENTS.map((event) => event.date);
    expect([...dates].sort()).toEqual(dates);
    const first = dates[0];
    const second = dates[1];
    if (first === undefined || second === undefined) {
      throw new Error("builder events are missing start dates");
    }
    expect(first < second).toBe(true);
  });

  it("uses only the cleared facts and omits attendance, price, and images", () => {
    expect(BUILDER_PUBLIC_EVENTS).toEqual([
      expect.objectContaining({
        title: "The AI Conference 2026",
        date: "2026-09-29",
        city: "San Francisco",
        location: "Pier 48, San Francisco",
        url: "https://aiconference.com/",
      }),
      expect.objectContaining({
        title: "World Summit AI Amsterdam 2026",
        date: "2026-10-07",
        city: "Amsterdam",
        location: "Taets Art & Event Park, Amsterdam",
        url: "https://worldsummit.ai/",
      }),
      expect.objectContaining({
        title: "Boston OpenClaw meetup",
        date: "2026-10-08",
        city: "Cambridge",
        location: "Microsoft NERD, Cambridge",
        url: "https://aiweek.boston/schedule/boston-openclaw-meetup",
      }),
      expect.objectContaining({
        title: "AI Engineer New York 2026",
        date: "2026-10-12",
        city: "New York",
        url: "https://ai.engineer/nyc/2026",
      }),
      expect.objectContaining({
        title: "TechEx Amsterdam Hackathon",
        date: "2026-10-16",
        city: "Amsterdam",
        location: "RAI Amsterdam",
        url: "https://lablab.ai/ai-hackathons/techex-amsterdam-hackathon",
      }),
      expect.objectContaining({
        title: "NVIDIA GTC Berlin 2026",
        date: "2026-10-20",
        city: "Berlin",
        location: "Tempodrom + STATION-Berlin",
        url: "https://www.nvidia.com/en-eu/gtc/",
      }),
      expect.objectContaining({
        title: "PyTorch Conference North America 2026",
        date: "2026-10-20",
        city: "San Jose",
        location: "San Jose Convention Center, San Jose",
        url: "https://events.linuxfoundation.org/pytorch-conference-north-america/",
      }),
      expect.objectContaining({
        title: "AIxIA 2026",
        date: "2026-10-22",
        city: "Strasbourg",
        location: "Palais de la Musique et des Congrès, Strasbourg",
        url: "https://aixia.eu/en/home",
      }),
      expect.objectContaining({
        title: "Agentic AI in the Wild: Open Source Agents in Production",
        date: "2026-10-22",
        city: "New York",
        location: "New York",
        url: "https://luma.com/l7dhbis5",
      }),
      expect.objectContaining({
        title: "Hacktoberfest Hack Day Barcelona",
        date: "2026-10-24",
        city: "Barcelona",
        location: "Edifici Colom, Barcelona",
        url: "https://events.mlh.com/events/14748-hacktoberfest-hack-day-barcelona",
      }),
      expect.objectContaining({
        title: "TEDAI 2026",
        date: "2026-10-28",
        city: "Vienna",
        url: "https://tedai-vienna.ted.com/",
      }),
      expect.objectContaining({
        title: "AI DevCon NYC",
        type: "conference",
        date: "2026-11-02",
        endDate: "2026-11-04",
        city: "Brooklyn",
        location: "Industry City, Building 5, Brooklyn",
        url: "https://tessl.io/devcon",
        isAi: true,
      }),
      expect.objectContaining({
        title: "The Agentic Transformation Summit",
        type: "conference",
        date: "2026-11-04",
        endDate: "2026-11-05",
        city: "Amsterdam",
        location: "Amsterdam Marriott Hotel, Stadhouderskade 12, Amsterdam",
        url: "https://www.aidataanalytics.network/events-agentic-ai-summit",
        isAi: true,
      }),
      expect.objectContaining({
        title: "The Amsterdam AI Summit 2026",
        type: "conference",
        date: "2026-11-04",
        endDate: "2026-11-04",
        startTime: "18:00",
        endTime: "21:00",
        city: "Amsterdam",
        location: "Zuiderkerk, Zuiderkerkhof 72, 1011 HJ Amsterdam",
        url: "https://luma.com/AmsterdamAI",
        isAi: true,
      }),
      expect.objectContaining({
        title: "IamExpat Fair The Hague",
        type: "conference",
        date: "2026-11-07",
        endDate: "2026-11-07",
        city: "The Hague",
        location: "Grote Kerk, Rond de Grote Kerk 12, The Hague",
        url: "https://www.iamexpat.nl/lifestyle/events-festivals-netherlands/iamexpat-fair-the-hague",
        isAi: false,
        startTime: "10:00",
        endTime: "17:00",
      }),
      expect.objectContaining({
        title: "Web Summit 2026",
        date: "2026-11-09",
        city: "Lisbon",
        location: "MEO Arena, Lisbon",
        url: "https://websummit.com/web-summit-2026/",
      }),
      expect.objectContaining({
        title: "AI Engineering Summit Austin 2026",
        type: "conference",
        date: "2026-11-12",
        endDate: "2026-11-12",
        city: "Austin",
        location: "AT&T Hotel and Conference Center, Austin",
        url: "https://www.testingmind.com/event/aiengineeringsummit-austin/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Say Hello",
        type: "meetup",
        date: "2026-11-12",
        endDate: "2026-11-12",
        startTime: "10:00",
        endTime: "12:00",
        city: "Eindhoven",
        location: "High Tech Campus Eindhoven, Building 27, 5656AE Eindhoven",
        url: "https://expatspousesinitiative.org/event/say-hello-31/",
        isAi: false,
      }),
      expect.objectContaining({
        title: "TEDxAmsterdam 2026: What Comes After Growth?",
        type: "meetup",
        date: "2026-11-12",
        endDate: "2026-11-12",
        startTime: "14:00",
        city: "Amsterdam",
        location: "Pakhuis de Zwijger, Piet Heinkade 179, 1019 HC Amsterdam",
        url: "https://www.tedxamsterdam.nl/after-growth",
        isAi: false,
      }),
      expect.objectContaining({
        title: "SIAI 2026",
        type: "conference",
        format: "hybrid",
        date: "2026-11-13",
        endDate: "2026-11-14",
        city: "Boston",
        location: "Wentworth Institute of Technology, Boston",
        url: "https://www.siai.co/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "KVK Ondernemersdagen 2026",
        type: "meetup",
        date: "2026-11-13",
        endDate: "2026-11-14",
        city: "Utrecht",
        location: "Jaarbeurs Utrecht, halls 2 and 4, Jaarbeursplein 6, Utrecht",
        url: "https://www.kvk.nl/evenementen/kvk-ondernemersdagen-2026/",
        priceCents: 0,
        isAi: false,
      }),
      expect.objectContaining({
        title: "AI & Data Science Day 2026",
        type: "meetup",
        date: "2026-11-13",
        endDate: "2026-11-13",
        startTime: "09:30",
        endTime: "17:30",
        city: "Amsterdam",
        location: "University Library, Vendelstraat 2-8, 1012 XX Amsterdam",
        url: "https://dsc.uva.nl/content/events/2026/11/ai-data-science-day-2026.html",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Sinterklaasintocht in Amsterdam",
        type: "meetup",
        date: "2026-11-15",
        endDate: "2026-11-15",
        startTime: "10:15",
        endTime: "15:30",
        city: "Amsterdam",
        location:
          "De Omval via Het Scheepvaartmuseum to Leidseplein, Amsterdam",
        url: "https://www.sintinamsterdam.nl/over-de-intocht/",
        isAi: false,
      }),
      expect.objectContaining({
        title: "AI Coding Summit NYC",
        type: "conference",
        format: "hybrid",
        date: "2026-11-16",
        endDate: "2026-11-19",
        city: "Jersey City",
        location: "Liberty Science Center, Jersey City, NJ",
        url: "https://aicodingsummit.com/nyc/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Handelsblatt AI Summit 2026",
        type: "conference",
        date: "2026-11-16",
        endDate: "2026-11-17",
        city: "Munich",
        location: "House of Communication, Friedenstr. 24, Munich",
        url: "https://live.handelsblatt.com/en/event/handelsblatt-ai-summit/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Microsoft Ignite",
        type: "conference",
        format: "hybrid",
        date: "2026-11-17",
        endDate: "2026-11-20",
        city: "San Francisco",
        location: "Moscone Center, San Francisco",
        url: "https://ignite.microsoft.com/en-US/home",
      }),
      expect.objectContaining({
        title: "Slush 2026",
        type: "conference",
        date: "2026-11-18",
        endDate: "2026-11-19",
        city: "Helsinki",
        location: "Messukeskus, Messuaukio 1, Helsinki",
        url: "https://slush.org/faq",
        isAi: false,
      }),
      expect.objectContaining({
        title: "AI Europe Congress 2026",
        date: "2026-11-19",
        endDate: "2026-11-19",
        city: "Warsaw",
        location:
          "BEC Financial Technologies office, ul. Emilii Plater 53, Warsaw",
        url: "https://aieuropecongress.pl/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "DSC Europe 2026",
        type: "conference",
        date: "2026-11-23",
        endDate: "2026-11-27",
        city: "Belgrade",
        location: "Belgrade Fair, Hall 3, Belgrade",
        url: "https://datasciconference.com/tickets/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Expatise Learning Event on Dutch Income Tax & Social Security",
        type: "meetup",
        date: "2026-11-24",
        endDate: "2026-11-24",
        startTime: "10:00",
        endTime: "17:00",
        city: "Utrecht",
        location: "Vergadercentrum Vredenburg, Vredenburg 19, Utrecht",
        url: "https://www.expatise.academy/details-en-registratie/expatise-learning-event-on-dutch-income-tax-social-security",
        isAi: false,
      }),
      expect.objectContaining({
        title: "UKAIRS 2026",
        date: "2026-11-24",
        endDate: "2026-11-25",
        city: "Edinburgh",
        location:
          "John McIntyre Conference Centre, 18 Holyrood Park Rd, Edinburgh",
        url: "https://www.ukairs.ac.uk/Home/Welcome",
        registrationDeadline: "2026-11-10",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Big Data Conference Europe 2026",
        type: "conference",
        format: "hybrid",
        date: "2026-11-24",
        endDate: "2026-11-27",
        city: "Vilnius",
        location:
          "Forum Cinemas Vingis, Savanorių pr. 7; SIMBIOCITY Nova, V. Gerulaičio g. 10, 08200 Vilnius",
        url: "https://bigdataconference.eu/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "AE Global Summit 2026",
        type: "conference",
        date: "2026-11-25",
        endDate: "2026-11-27",
        city: "London",
        location: "Friends House, London",
        url: "https://www.algopreneurship.org/faq",
        isAi: true,
      }),
      expect.objectContaining({
        title: "Data Science Summit",
        type: "conference",
        format: "hybrid",
        date: "2026-11-26",
        endDate: "2026-11-27",
        city: "Warsaw",
        location: "PGE Narodowy, al. Ks. Józefa Poniatowskiego 1, Warsaw",
        url: "https://main.dssconf.pl/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "LLMday London",
        date: "2026-11-26",
        city: "London",
        location: "Everyman Canary Wharf, London",
        url: "https://llmday.com/2026-london-q4/index.html",
      }),
      expect.objectContaining({
        title: "Welcome to The Hague event",
        type: "meetup",
        date: "2026-11-26",
        endDate: "2026-11-26",
        startTime: "18:00",
        endTime: "20:30",
        city: "Den Haag",
        location: "The Fiddler, Riviervismarkt 1, 2513AM Den Haag",
        url: "https://www.thehagueinternationalcentre.nl/events/2026-11/welcome-to-the-hague-event",
        isAi: false,
      }),
      expect.objectContaining({
        title: "AWS re:Invent 2026",
        type: "conference",
        date: "2026-11-30",
        endDate: "2026-12-04",
        city: "Las Vegas",
        location: "Las Vegas, NV",
        url: "https://reinvent.awsevents.com/",
      }),
      expect.objectContaining({
        title: "Generative AI Summit London",
        type: "conference",
        date: "2026-12-01",
        endDate: "2026-12-01",
        city: "London",
        location: "InterContinental London - The O2, 1 Waterview Drive, London",
        url: "https://world.aiacceleratorinstitute.com/location/london/",
        isAi: true,
      }),
      expect.objectContaining({
        title: "apidays Paris",
        type: "conference",
        date: "2026-12-01",
        endDate: "2026-12-03",
        city: "Paris",
        location: "CNIT Forest, Paris",
        url: "https://www.apidays.global/events/paris",
        isAi: true,
      }),
      expect.objectContaining({
        title: "AI@HPI Conference 2026",
        date: "2026-12-02",
        endDate: "2026-12-03",
        city: "Potsdam",
        location: "Hasso Plattner Institute, Potsdam",
        url: "https://hpi.de/en/ai-hpi-conference/",
        priceCents: 29000,
        isAi: true,
      }),
      expect.objectContaining({
        title: "The AI Summit New York",
        type: "conference",
        date: "2026-12-09",
        endDate: "2026-12-10",
        city: "New York",
        location: "Javits Center, 429 11th Ave, New York",
        url: "https://newyork.theaisummit.com/",
        isAi: true,
      }),
    ]);

    for (const event of BUILDER_PUBLIC_EVENTS) {
      expect(event.url.startsWith("https://")).toBe(true);
      expect(event.summary.en.length).toBeGreaterThan(0);
      expect(event.summary.en.length).toBeLessThanOrEqual(
        PUBLIC_EVENTS_WHY_MAX,
      );
      expect(event.summary.nl.length).toBeGreaterThan(0);
      expect(event.summary.nl.length).toBeLessThanOrEqual(
        PUBLIC_EVENTS_WHY_MAX,
      );
      expect(event.summary.en).not.toMatch(COUNT_COPY);
      expect(event.summary.nl).not.toMatch(COUNT_COPY);
      expect(JSON.stringify(event).toLowerCase()).not.toContain("turku");
      expect(event).not.toHaveProperty("maxAttendees");
      expect(event).not.toHaveProperty("price");
      expect(event).not.toHaveProperty("image");
      expect(event).not.toHaveProperty("rsvp");
    }
  });

  it("keeps the official URL in the description without inventing a count", () => {
    const event = BUILDER_PUBLIC_EVENTS[0];
    expect(event).toBeDefined();
    const doc = builderEventDescription(
      event!.summary.en,
      event!.url,
      "Official page:",
    );
    const text = doc.root.children[0]?.children[0]?.text ?? "";
    expect(text).toContain(event!.url);
    expect(text).toContain("Pier 48");
    expect(text).not.toMatch(COUNT_COPY);
  });

  it("upserts locales without a hard-coded enum__locales cast", async () => {
    const event = BUILDER_PUBLIC_EVENTS[0];
    expect(event).toBeDefined();
    let query: unknown;
    await upsertBuilderEvent(
      {
        execute: async (statement: unknown) => {
          // A conference type probes pg_enum before the upsert, and a later
          // end-date probe must not replace the insert.
          const text = staticSql(statement);
          if (text.includes('INSERT INTO "events"')) query = statement;
        },
      } as never,
      event!,
    );

    const sqlText = staticSql(query);
    expect(sqlText).not.toContain("enum__locales");
    expect(sqlText).not.toMatch(/::\s*"public"\s*\.\s*"enum__locales"/);
    expect(sqlText).toContain('INSERT INTO "events_locales"');
    expect(sqlText).toContain('INSERT INTO "_events_v_locales"');
    expect(sqlText.match(/'en'/g)).toEqual(["'en'", "'en'"]);
    expect(sqlText.match(/'nl'/g)).toEqual(["'nl'", "'nl'"]);
  });

  it("registers a Payload seed migration that retires Turku and skips counts", () => {
    const migration = readFileSync(MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    expect(index).toContain("20260925a_builder_public_events");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).toMatch(/turku/i);
    expect(migration).toContain("cancelled");
    expect(migration).toContain("archived");
    expect(migration).not.toMatch(/max_attendees|image_id|cover_image/);
    const insertAt = migration.indexOf('INSERT INTO "events"');
    const conflictAt = migration.indexOf('ON CONFLICT ("slug")');
    expect(insertAt).toBeGreaterThan(-1);
    expect(conflictAt).toBeGreaterThan(insertAt);
    expect(migration.slice(insertAt, conflictAt)).not.toContain('"price"');
    const page = readFileSync(EVENTS_PAGE, "utf8");
    expect(page).toContain('collection: "events"');
    expect(page).toMatch(/isPast\s*\?\s*"-date"\s*:\s*"date"/);
  });

  it("registers a follow-up migration that upserts tedai-2026 only", () => {
    const tedai = BUILDER_PUBLIC_EVENTS.find(
      (event) => event.slug === "tedai-2026",
    );
    expect(tedai).toMatchObject({
      title: "TEDAI 2026",
      date: "2026-10-28",
      city: "Vienna",
      country: "Austria",
      location: "Vienna",
      timezone: "Europe/Vienna",
      url: "https://tedai-vienna.ted.com/",
    });

    const migration = readFileSync(TEDAI_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf("20260925a_builder_public_events");
    const followUp = index.indexOf("20260925b_tedai_vienna");
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain('const TEDAI_SLUG = "tedai-2026"');
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).not.toMatch(
      /clinical|turku|max_attendees|image_id|"price"/i,
    );
  });

  it("registers a follow-up migration that upserts only the three new events", () => {
    const slugs = [
      "pytorch-conference-north-america-2026",
      "aixia-2026",
      "web-summit-2026",
    ] as const;
    for (const slug of slugs) {
      expect(BUILDER_PUBLIC_EVENTS.some((event) => event.slug === slug)).toBe(
        true,
      );
    }

    const migration = readFileSync(OCTOBER_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf("20261004a_collector_run_preset");
    const followUp = index.indexOf("20261005a_pytorch_aixia_web_summit");
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).not.toMatch(
      /agentic economy|big data expo|apply ai summit|max_attendees|image_id|"price"|rsvp/i,
    );
    for (const event of BUILDER_PUBLIC_EVENTS) {
      expect(`${event.slug} ${event.title}`).not.toMatch(
        /agentic economy|big data expo|apply ai summit/i,
      );
    }
    expect(JSON.stringify(BUILDER_PUBLIC_EVENTS)).not.toMatch(
      /maxAttendees|rsvp/i,
    );
  });

  it("registers a follow-up migration that upserts only the five new events", () => {
    const slugs = [
      "boston-openclaw-meetup-2026",
      "techex-amsterdam-hackathon-2026",
      "agentic-ai-in-the-wild-2026",
      "hacktoberfest-hack-day-barcelona-2026",
      "llmday-london-2026",
    ] as const;
    for (const slug of slugs) {
      expect(BUILDER_PUBLIC_EVENTS.some((event) => event.slug === slug)).toBe(
        true,
      );
      expect(
        BUILDER_PUBLIC_EVENTS.find((event) => event.slug === slug),
      ).not.toHaveProperty("endDate");
    }

    const migration = readFileSync(FIVE_EVENTS_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf("20261005a_pytorch_aixia_web_summit");
    const followUp = index.indexOf("20261006a_five_public_events");
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).not.toMatch(
      /agentic economy|big data expo|apply ai summit|max_attendees|image_id|"price"|rsvp/i,
    );
    const docs = readFileSync(
      join(dir, "../../../docs/ops/curated-public-events.md"),
      "utf8",
    );
    expect(docs).toContain("20261006a_five_public_events");
    for (const slug of slugs) {
      expect(docs).toContain(slug);
    }
  });

  it("records an official last day only where the summary states one", () => {
    const endBySlug = Object.fromEntries(
      BUILDER_PUBLIC_EVENTS.map((event) => [event.slug, event.endDate ?? null]),
    );
    expect(endBySlug).toEqual({
      "the-ai-conference-2026": "2026-10-01",
      "world-summit-ai-amsterdam-2026": "2026-10-08",
      "boston-openclaw-meetup-2026": null,
      "ai-engineer-new-york-2026": "2026-10-14",
      "techex-amsterdam-hackathon-2026": null,
      "nvidia-gtc-berlin-2026": "2026-10-22",
      "pytorch-conference-north-america-2026": "2026-10-21",
      "aixia-2026": null,
      "agentic-ai-in-the-wild-2026": null,
      "hacktoberfest-hack-day-barcelona-2026": null,
      "tedai-2026": "2026-10-30",
      "ai-devcon-nyc-2026": "2026-11-04",
      "agentic-transformation-summit-amsterdam-2026": "2026-11-05",
      "the-amsterdam-ai-summit-2026": "2026-11-04",
      "iamexpat-fair-the-hague-2026": "2026-11-07",
      "web-summit-2026": "2026-11-12",
      "ai-engineering-summit-austin-2026": "2026-11-12",
      "say-hello-eindhoven-2026": "2026-11-12",
      "tedxamsterdam-2026": "2026-11-12",
      "siai-2026": "2026-11-14",
      "kvk-ondernemersdagen-2026": "2026-11-14",
      "ai-data-science-day-2026": "2026-11-13",
      "sinterklaasintocht-amsterdam-2026": "2026-11-15",
      "ai-coding-summit-nyc-2026": "2026-11-19",
      "handelsblatt-ai-summit-2026": "2026-11-17",
      "microsoft-ignite-2026": "2026-11-20",
      "slush-2026": "2026-11-19",
      "ai-europe-congress-2026": "2026-11-19",
      "dsc-europe-2026": "2026-11-27",
      "expatise-income-tax-utrecht-2026": "2026-11-24",
      "ukairs-2026": "2026-11-25",
      "big-data-conference-europe-2026": "2026-11-27",
      "ae-global-summit-2026": "2026-11-27",
      "data-science-summit-warsaw-2026": "2026-11-27",
      "llmday-london-2026": null,
      "welcome-to-the-hague-2026": "2026-11-26",
      "aws-reinvent-2026": "2026-12-04",
      "generative-ai-summit-london-2026": "2026-12-01",
      "apidays-paris-2026": "2026-12-03",
      "ai-hpi-conference-2026": "2026-12-03",
      "the-ai-summit-new-york-2026": "2026-12-10",
    });
  });

  it("registers the end-date column migration after the five-event seed", () => {
    const migration = readFileSync(
      join(dir, "../../migrations/20261006b_event_end_date.ts"),
      "utf8",
    );
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const five = index.indexOf("20261006a_five_public_events");
    const followUp = index.indexOf("20261006b_event_end_date");
    const forumRepair = index.indexOf("20261008a_forum_reply_count_repair");
    expect(five).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(five);
    expect(forumRepair).toBeGreaterThan(followUp);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "end_date"');
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).not.toMatch(/enum__locales|enum_events/);
    const helper = readFileSync(MIGRATION, "utf8");
    expect(helper).toContain("writeBuilderEventEndDate");
    expect(helper).toContain("information_schema.columns");
    expect(helper).not.toMatch(/::\s*"public"\s*\.\s*"enum__locales"/);
  });

  it("registers a follow-up migration that upserts only the November events", () => {
    const slugs = [
      "iamexpat-fair-the-hague-2026",
      "slush-2026",
      "ai-europe-congress-2026",
      "ukairs-2026",
      "ai-hpi-conference-2026",
    ] as const;
    const policyNote =
      /how AIT lists|community sign-up|not an event ticket|AIT lists/i;

    for (const slug of slugs) {
      const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
      expect(event?.slug.endsWith("-2026")).toBe(true);
      expect(event?.summary.en).not.toMatch(policyNote);
      expect(event?.summary.nl).not.toMatch(policyNote);
      expect(event?.endDate).toBeTruthy();
    }

    expect(
      BUILDER_PUBLIC_EVENTS.find((event) => event.slug === "ukairs-2026"),
    ).toMatchObject({ registrationDeadline: "2026-11-10", isAi: true });
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "ai-hpi-conference-2026",
      ),
    ).toMatchObject({ priceCents: 29000, isAi: true });
    expect(
      BUILDER_PUBLIC_EVENTS.filter((event) => event.priceCents != null).map(
        (event) => event.slug,
      ),
    ).toEqual(["kvk-ondernemersdagen-2026", "ai-hpi-conference-2026"]);
    expect(
      BUILDER_PUBLIC_EVENTS.filter((event) => event.isAi === false).map(
        (event) => event.slug,
      ),
    ).toEqual([
      "iamexpat-fair-the-hague-2026",
      "say-hello-eindhoven-2026",
      "tedxamsterdam-2026",
      "kvk-ondernemersdagen-2026",
      "sinterklaasintocht-amsterdam-2026",
      "slush-2026",
      "expatise-income-tax-utrecht-2026",
      "welcome-to-the-hague-2026",
    ]);

    const migration = readFileSync(NOVEMBER_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf('name: "20261017a_news_item_is_ai"');
    const followUp = index.indexOf('name: "20261019a_five_public_events"');
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).toContain("EVENT_COORDINATE_BACKFILL");
    expect(migration).toContain(
      'AND ("latitude" IS NULL OR "longitude" IS NULL)',
    );
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).not.toMatch(/max_attendees|image_id|rsvp/i);
    const docs = readFileSync(
      join(dir, "../../../docs/ops/curated-public-events.md"),
      "utf8",
    );
    expect(docs).toContain("20261019a_five_public_events");
    for (const slug of slugs) {
      expect(docs).toContain(slug);
    }
  });

  it("registers a follow-up migration that upserts only the ten new events", () => {
    const slugs = [
      "ai-devcon-nyc-2026",
      "ai-engineering-summit-austin-2026",
      "siai-2026",
      "kvk-ondernemersdagen-2026",
      "ai-coding-summit-nyc-2026",
      "dsc-europe-2026",
      "expatise-income-tax-utrecht-2026",
      "ae-global-summit-2026",
      "data-science-summit-warsaw-2026",
      "generative-ai-summit-london-2026",
    ] as const;
    const metas: Record<(typeof slugs)[number], string> = {
      "ai-devcon-nyc-2026":
        "AI DevCon NYC. 02–04 Nov 2026. Industry City, Building 5, Brooklyn.",
      "ai-engineering-summit-austin-2026":
        "AI Engineering Summit Austin 2026. 12 Nov 2026. AT&T Hotel and Conference Center, Austin.",
      "siai-2026":
        "SIAI 2026. 13–14 Nov 2026. Wentworth Institute of Technology, Boston.",
      "kvk-ondernemersdagen-2026":
        "KVK Ondernemersdagen 2026. 13–14 Nov 2026. Jaarbeurs Utrecht, halls 2 and 4, Jaarbeursplein 6, Utrecht.",
      "ai-coding-summit-nyc-2026":
        "AI Coding Summit NYC. 16–19 Nov 2026. Liberty Science Center, Jersey City, NJ.",
      "dsc-europe-2026":
        "DSC Europe 2026. 23–27 Nov 2026. Belgrade Fair, Hall 3, Belgrade.",
      "expatise-income-tax-utrecht-2026":
        "Expatise Learning Event on Dutch Income Tax & Social Security. 24 Nov 2026. Vergadercentrum Vredenburg, Vredenburg 19, Utrecht.",
      "ae-global-summit-2026":
        "AE Global Summit 2026. 25–27 Nov 2026. Friends House, London.",
      "data-science-summit-warsaw-2026":
        "Data Science Summit. 26–27 Nov 2026. PGE Narodowy, al. Ks. Józefa Poniatowskiego 1, Warsaw.",
      "generative-ai-summit-london-2026":
        "Generative AI Summit London. 01 Dec 2026. InterContinental London - The O2, 1 Waterview Drive, London.",
    };

    for (const slug of slugs) {
      const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
      expect(event?.slug.endsWith("-2026")).toBe(true);
      expect(event?.endDate).toBeTruthy();
      expect(event?.summary.en).not.toMatch(/early bird/i);
      expect(event?.summary.nl).not.toMatch(/early bird/i);
      const description = `${event!.summary.en} Official page: ${event!.url}`;
      const meta = eventMetaDescription(
        {
          title: event!.title,
          date: event!.date,
          endDate: event!.endDate,
          city: event!.city,
          location: event!.location,
          format: event!.format ?? "in-person",
          description,
        },
        "en",
      );
      expect(meta).toBe(metas[slug]);
      expect(meta.length).toBeLessThanOrEqual(160);
      expect(meta).not.toMatch(/early bird|flagship|invite-only/i);
    }

    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "ae-global-summit-2026",
      )?.summary.en,
    ).toContain(
      "single-day tickets are £15 for students and £30 general; student three-day passes are £45",
    );
    expect(
      BUILDER_PUBLIC_EVENTS.find((event) => event.slug === "dsc-europe-2026")
        ?.url,
    ).toBe("https://datasciconference.com/tickets/");
    expect(
      BUILDER_PUBLIC_EVENTS.find((event) => event.slug === "siai-2026")?.format,
    ).toBe("hybrid");

    const migration = readFileSync(TEN_EVENTS_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf('name: "20261019a_five_public_events"');
    const followUp = index.indexOf('name: "20261021a_ten_public_events"');
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).toContain("EVENT_COORDINATE_BACKFILL");
    expect(migration).toContain(
      'AND ("latitude" IS NULL OR "longitude" IS NULL)',
    );
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).not.toMatch(
      /world congress|giant|mlcon|zevenheuvelenloop|max_attendees|image_id|rsvp/i,
    );
    expect(JSON.stringify(BUILDER_PUBLIC_EVENTS)).not.toMatch(
      /world congress|giant|mlcon|zevenheuvelenloop|early bird/i,
    );
    const docs = readFileSync(
      join(dir, "../../../docs/ops/curated-public-events.md"),
      "utf8",
    );
    expect(docs).toContain("20261021a_ten_public_events");
    for (const slug of slugs) {
      expect(docs).toContain(slug);
    }
  });

  it("registers a follow-up migration that upserts only the seven new events", () => {
    const slugs = [
      "agentic-transformation-summit-amsterdam-2026",
      "sinterklaasintocht-amsterdam-2026",
      "handelsblatt-ai-summit-2026",
      "microsoft-ignite-2026",
      "welcome-to-the-hague-2026",
      "apidays-paris-2026",
      "the-ai-summit-new-york-2026",
    ] as const;
    const metas: Record<(typeof slugs)[number], string> = {
      "agentic-transformation-summit-amsterdam-2026":
        "The Agentic Transformation Summit. 04–05 Nov 2026. Amsterdam Marriott Hotel, Stadhouderskade 12, Amsterdam.",
      "sinterklaasintocht-amsterdam-2026":
        "Sinterklaasintocht in Amsterdam. 15 Nov 2026. De Omval via Het Scheepvaartmuseum to Leidseplein, Amsterdam.",
      "handelsblatt-ai-summit-2026":
        "Handelsblatt AI Summit 2026. 16–17 Nov 2026. House of Communication, Friedenstr. 24, Munich.",
      "microsoft-ignite-2026":
        "Microsoft Ignite. 17–20 Nov 2026. Moscone Center, San Francisco.",
      "welcome-to-the-hague-2026":
        "Welcome to The Hague event. 26 Nov 2026. The Fiddler, Riviervismarkt 1, 2513AM Den Haag.",
      "apidays-paris-2026":
        "apidays Paris. 01–03 Dec 2026. CNIT Forest, Paris.",
      "the-ai-summit-new-york-2026":
        "The AI Summit New York. 09–10 Dec 2026. Javits Center, 429 11th Ave, New York.",
    };

    for (const slug of slugs) {
      const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
      expect(event?.slug.endsWith("-2026")).toBe(true);
      expect(event?.endDate).toBeTruthy();
      expect(event).not.toHaveProperty("priceCents");
      const description = `${event!.summary.en} Official page: ${event!.url}`;
      const meta = eventMetaDescription(
        {
          title: event!.title,
          date: event!.date,
          endDate: event!.endDate,
          city: event!.city,
          location: event!.location,
          format: event!.format ?? "in-person",
          description,
        },
        "en",
      );
      expect(meta).toBe(metas[slug]);
      expect(meta.length).toBeLessThanOrEqual(160);
      expect(meta.startsWith(`${event!.title}. `)).toBe(true);
      const descriptionNl = `${event!.summary.nl} Officiële pagina: ${event!.url}`;
      const metaNl = eventMetaDescription(
        {
          title: event!.title,
          date: event!.date,
          endDate: event!.endDate,
          city: event!.city,
          location: event!.location,
          format: event!.format ?? "in-person",
          description: descriptionNl,
        },
        "nl",
      );
      const factsNl = eventMetaDescription(
        {
          title: event!.title,
          date: event!.date,
          endDate: event!.endDate,
          city: event!.city,
          location: event!.location,
          format: event!.format ?? "in-person",
          description: "",
        },
        "nl",
      );
      expect(metaNl).toBe(factsNl);
      expect(metaNl).not.toMatch(/officiële pagina|https?:/i);
      expect(metaNl.length).toBeLessThanOrEqual(160);
    }

    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "microsoft-ignite-2026",
      )?.format,
    ).toBe("hybrid");
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "microsoft-ignite-2026",
      )?.isAi,
    ).toBeUndefined();
    expect(
      BUILDER_PUBLIC_EVENTS.find((event) => event.slug === "apidays-paris-2026")
        ?.isAi,
    ).toBe(true);

    const migration = readFileSync(SEVEN_EVENTS_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf('name: "20261021a_ten_public_events"');
    const followUp = index.indexOf('name: "20261022a_seven_public_events"');
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).toContain("EVENT_COORDINATE_BACKFILL");
    expect(migration).toContain(
      'AND ("latitude" IS NULL OR "longitude" IS NULL)',
    );
    expect(migration).not.toMatch(/\b(ALTER|CREATE|DROP)\b/);
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).toContain("from €950");
    expect(migration).toContain("free digital pass, then Hub pass $1,625");
    expect(migration).toContain("Expo pass from $129");
    expect(migration).toContain("from €1,799 + VAT");
    expect(migration).toContain("registration required");
    expect(migration).toContain("times approximate");
    expect(migration).not.toMatch(/odsc|max_attendees|image_id|rsvp/i);
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "welcome-to-the-hague-2026",
      )?.summary.en,
    ).not.toMatch(/\bfree\b/i);
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "welcome-to-the-hague-2026",
      )?.summary.nl,
    ).not.toMatch(/\bgratis\b/i);
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "sinterklaasintocht-amsterdam-2026",
      )?.title,
    ).toBe("Sinterklaasintocht in Amsterdam");
    expect(JSON.stringify(BUILDER_PUBLIC_EVENTS)).not.toMatch(/\bodsc\b/i);

    const detail = readFileSync(
      join(dir, "../../app/[locale]/events/[slug]/page.tsx"),
      "utf8",
    );
    expect(detail).toContain("eventMetaDescription");
    expect(detail).toContain("eventSchemaDates");
    expect(detail).toContain('"@type": "Event"');
    expect(detail).toContain("localeAlternates(`/events/${slug}`)");
    const sitemap = readFileSync(join(dir, "../../app/sitemap.ts"), "utf8");
    expect(sitemap).toContain("`/events/${event.slug}`");

    const docs = readFileSync(
      join(dir, "../../../docs/ops/curated-public-events.md"),
      "utf8",
    );
    expect(docs).toContain("20261022a_seven_public_events");
    for (const slug of slugs) {
      expect(docs).toContain(slug);
    }
  });

  it("registers a follow-up migration that upserts only the six new events", () => {
    const slugs = [
      "the-amsterdam-ai-summit-2026",
      "say-hello-eindhoven-2026",
      "tedxamsterdam-2026",
      "ai-data-science-day-2026",
      "big-data-conference-europe-2026",
      "aws-reinvent-2026",
    ] as const;
    const metas: Record<(typeof slugs)[number], { en: string; nl: string }> = {
      "the-amsterdam-ai-summit-2026": {
        en: "The Amsterdam AI Summit 2026. 04 Nov 2026. Zuiderkerk, Zuiderkerkhof 72, 1011 HJ Amsterdam.",
        nl: "The Amsterdam AI Summit 2026. 04 nov 2026. Zuiderkerk, Zuiderkerkhof 72, 1011 HJ Amsterdam.",
      },
      "say-hello-eindhoven-2026": {
        en: "Say Hello. 12 Nov 2026. High Tech Campus Eindhoven, Building 27, 5656AE Eindhoven.",
        nl: "Say Hello. 12 nov 2026. High Tech Campus Eindhoven, Building 27, 5656AE Eindhoven.",
      },
      "tedxamsterdam-2026": {
        en: "TEDxAmsterdam 2026: What Comes After Growth. 12 Nov 2026. Pakhuis de Zwijger, Piet Heinkade 179, 1019 HC Amsterdam.",
        nl: "TEDxAmsterdam 2026: What Comes After Growth. 12 nov 2026. Pakhuis de Zwijger, Piet Heinkade 179, 1019 HC Amsterdam.",
      },
      "ai-data-science-day-2026": {
        en: "AI & Data Science Day 2026. 13 Nov 2026. University Library, Vendelstraat 2-8, 1012 XX Amsterdam.",
        nl: "AI & Data Science Day 2026. 13 nov 2026. University Library, Vendelstraat 2-8, 1012 XX Amsterdam.",
      },
      "big-data-conference-europe-2026": {
        en: "Big Data Conference Europe 2026. 24–27 Nov 2026. Forum Cinemas Vingis, Savanorių pr. 7; SIMBIOCITY Nova, V. Gerulaičio g. 10, 08200 Vilnius.",
        nl: "Big Data Conference Europe 2026. 24–27 nov 2026. Forum Cinemas Vingis, Savanorių pr. 7; SIMBIOCITY Nova, V. Gerulaičio g. 10, 08200 Vilnius.",
      },
      "aws-reinvent-2026": {
        en: "AWS re:Invent 2026. 30 Nov – 04 Dec 2026. Las Vegas, NV.",
        nl: "AWS re:Invent 2026. 30 nov – 04 dec 2026. Las Vegas, NV.",
      },
    };

    for (const slug of slugs) {
      const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
      expect(event?.slug.endsWith("-2026")).toBe(true);
      expect(event?.endDate).toBeTruthy();
      expect(event).not.toHaveProperty("priceCents");
      const source = {
        title: event!.title,
        date: event!.date,
        endDate: event!.endDate,
        city: event!.city,
        location: event!.location,
        format: event!.format ?? "in-person",
      };
      const meta = eventMetaDescription(
        {
          ...source,
          description: `${event!.summary.en} Official page: ${event!.url}`,
        },
        "en",
      );
      expect(meta).toBe(metas[slug].en);
      expect(meta.length).toBeLessThanOrEqual(160);
      expect(meta).not.toMatch(/€|\$|registration required|https?:/i);
      const metaNl = eventMetaDescription(
        {
          ...source,
          description: `${event!.summary.nl} Officiële pagina: ${event!.url}`,
        },
        "nl",
      );
      expect(metaNl).toBe(metas[slug].nl);
      expect(metaNl).not.toMatch(/officiële pagina|https?:/i);
      expect(metaNl.length).toBeLessThanOrEqual(160);
      expect(metaNl.split(". ").at(-1)).toBe(meta.split(". ").at(-1));
    }

    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "big-data-conference-europe-2026",
      )?.format,
    ).toBe("hybrid");
    const ignite = BUILDER_PUBLIC_EVENTS.find(
      (event) => event.slug === "microsoft-ignite-2026",
    );
    const reinvent = BUILDER_PUBLIC_EVENTS.find(
      (event) => event.slug === "aws-reinvent-2026",
    );
    expect(reinvent?.isAi).toBe(ignite?.isAi);
    expect(reinvent?.isAi).toBeUndefined();
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "say-hello-eindhoven-2026",
      )?.summary.en,
    ).not.toMatch(/\bfree\b/i);
    expect(
      BUILDER_PUBLIC_EVENTS.find(
        (event) => event.slug === "ai-data-science-day-2026",
      )?.summary.nl,
    ).not.toMatch(/\bgratis\b/i);
    expect(JSON.stringify(BUILDER_PUBLIC_EVENTS)).not.toMatch(/\bodsc\b/i);
    expect(
      BUILDER_PUBLIC_EVENTS.some((event) => event.slug === "tedai-2026"),
    ).toBe(true);
    expect(
      BUILDER_PUBLIC_EVENTS.filter((event) =>
        event.slug.includes("tedxamsterdam"),
      ),
    ).toHaveLength(1);

    const migration = readFileSync(SIX_EVENTS_MIGRATION, "utf8");
    const index = readFileSync(MIGRATION_INDEX, "utf8");
    const prior = index.indexOf('name: "20261022a_seven_public_events"');
    const followUp = index.indexOf('name: "20261023a_six_public_events"');
    expect(prior).toBeGreaterThan(-1);
    expect(followUp).toBeGreaterThan(prior);
    expect(migration).toContain("upsertBuilderEvent");
    expect(migration).toContain("BUILDER_PUBLIC_EVENTS");
    expect(migration).toContain("EVENT_COORDINATE_BACKFILL");
    expect(migration).toContain(
      'AND ("latitude" IS NULL OR "longitude" IS NULL)',
    );
    expect(migration).toContain("discovery_source");
    expect(migration).not.toMatch(/\b(ALTER|CREATE|DROP)\b/);
    for (const slug of slugs) {
      expect(migration).toContain(slug);
    }
    expect(migration).toContain("General Admission €34.99");
    expect(migration).toContain("from €47.60");
    expect(migration).toContain("1-day onsite €450 excl. VAT");
    expect(migration).toContain("full price $2,499");
    expect(migration).toContain("registration required");
    expect(migration).toContain(
      "aws-reinvent-2026 is_ai must match microsoft-ignite-2026",
    );
    expect(migration).not.toMatch(/odsc|max_attendees|image_id|rsvp/i);

    const detail = readFileSync(
      join(dir, "../../app/[locale]/events/[slug]/page.tsx"),
      "utf8",
    );
    expect(detail).toContain("eventMetaDescription");
    expect(detail).toContain("eventSchemaDates");
    expect(detail).toContain('"@type": "Event"');
    expect(detail).toContain("localeAlternates(`/events/${slug}`)");
    const sitemap = readFileSync(join(dir, "../../app/sitemap.ts"), "utf8");
    expect(sitemap).toContain("`/events/${event.slug}`");
    expect(publishedEventsVisibleWhere([])).toMatchObject({
      discoverySource: { not_equals: "luma" },
      status: { equals: "published" },
    });

    const docs = readFileSync(
      join(dir, "../../../docs/ops/curated-public-events.md"),
      "utf8",
    );
    expect(docs).toContain("20261023a_six_public_events");
    expect(docs).toContain("whose `events.is_ai` is null");
    for (const slug of slugs) {
      expect(docs).toContain(slug);
    }
  });
});
