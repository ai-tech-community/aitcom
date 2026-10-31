import { z } from "zod";
import type { Collector } from "../collector";
import { CollectorStop } from "../errors";
const inputSchema = z.object({ url: z.url({ protocol: /^https$/ }).max(2048) });
const itemSchema = z.object({
  name: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  url: z.string(),
  venue: z.string().nullable(),
  city: z.string().nullable(),
  online: z.boolean().nullable(),
  organizer: z.string().nullable(),
});
export const eventPage: Collector<
  z.infer<typeof inputSchema>,
  z.infer<typeof itemSchema>
> = {
  id: "event-page",
  version: 1,
  author: "platform",
  kind: "page",
  title: { en: "Event page", nl: "Evenementpagina", fr: "Page d’événement" },
  description: {
    en: "Read structured Event data from a public page: dates, venue, city, online attendance and organizer. Pages must include Event JSON-LD in their initial HTML.",
    nl: "Lees gestructureerde evenementgegevens van een openbare pagina: datums, locatie, stad, online deelname en organisator. De oorspronkelijke HTML moet Event-JSON-LD bevatten.",
    fr: "Lisez les données Event d’une page publique : dates, lieu, ville, participation en ligne et organisateur. Le HTML initial doit contenir des données Event JSON-LD.",
  },
  inputSchema,
  itemSchema,
  fieldHints: {
    url: {
      label: {
        en: "Event page address",
        nl: "Adres van de evenementpagina",
        fr: "Adresse de la page d’événement",
      },
      placeholder: "https://example.org/events/community-day",
    },
  },
  sampleItem: {
    name: "Community day",
    startDate: "2026-11-20T18:00:00+01:00",
    endDate: null,
    url: "https://example.org/events/community-day",
    venue: "Town hall",
    city: "Amsterdam",
    online: false,
    organizer: "AIT Community",
  },
  limits: { maxPages: 6, maxItems: 5000, maxDurationMs: 60000 },
  async *run(input, ctx) {
    const res = await ctx.fetch(input.url, {
      accept: "text/html,application/xhtml+xml",
    });
    if (res.status < 200 || res.status >= 300)
      throw new CollectorStop(
        "error",
        "failed",
        `The page answered with status ${res.status}.`,
        { code: "page_status", params: { status: res.status } },
      );
    const type = res.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (type && type !== "text/html" && type !== "application/xhtml+xml")
      throw new CollectorStop(
        "error",
        "failed",
        "This address is not a web page.",
        { code: "not_a_page" },
      );
    const result = await ctx.extractEvents({
      html: await res.html(),
      url: res.url,
    });
    const issues = result.eventIssues;
    if (issues?.malformedScripts)
      ctx.log(`${issues.malformedScripts} JSON-LD scripts could not be read.`);
    if (issues?.invalidEvents)
      ctx.log(`${issues.invalidEvents} events without a name were skipped.`);
    if (!result.rows.length)
      throw new CollectorStop(
        "error",
        "failed",
        "No readable structured Event data was found on this page.",
        {
          code:
            issues?.malformedScripts || issues?.invalidEvents
              ? "event_data_invalid"
              : "no_event_data",
        },
      );
    ctx.log(`Found ${result.rows.length} events.`);
    for (const row of result.rows)
      yield {
        name: row.name!,
        startDate: row.startDate ?? null,
        endDate: row.endDate ?? null,
        url: row.url!,
        venue: row.venue ?? null,
        city: row.city ?? null,
        online: row.online === null ? null : row.online === "true",
        organizer: row.organizer ?? null,
      };
    if (result.truncated)
      throw new CollectorStop(
        "item_limit",
        "succeeded",
        "Stopped at the page output limit.",
      );
  },
};
