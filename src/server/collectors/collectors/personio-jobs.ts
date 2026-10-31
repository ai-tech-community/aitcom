import { z } from "zod";
import {
  PERSONIO_LANGUAGES,
  parsePersonioBoard,
  personioFeedUrl,
  recognizePersonioBoard,
} from "@/lib/job-boards/personio";
import { jobBoardRowSchema } from "@/lib/job-boards/job-board";
import type { Collector } from "../collector";
import { CollectorStop } from "../errors";

const inputSchema = z.object({
  url: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine((value) => recognizePersonioBoard(new URL(value)) !== null),
  language: z.enum(PERSONIO_LANGUAGES).default("en"),
});

export const personioJobs: Collector<
  z.infer<typeof inputSchema>,
  z.infer<typeof jobBoardRowSchema>
> = {
  id: "personio-jobs",
  version: 1,
  author: "platform",
  kind: "api",
  title: {
    en: "Personio jobs",
    nl: "Personio-vacatures",
    fr: "Offres Personio",
  },
  description: {
    en: "Published jobs from a Personio company board, in the language you choose.",
    nl: "Gepubliceerde vacatures van een Personio-vacaturesite, in de taal die je kiest.",
    fr: "Les offres publiées sur le site Personio d’une entreprise, dans la langue choisie.",
  },
  inputSchema,
  itemSchema: jobBoardRowSchema,
  fieldHints: {
    url: {
      label: {
        en: "Company board link",
        nl: "Link naar de vacaturesite",
        fr: "Lien du site d’emploi",
      },
      placeholder: "https://demo.jobs.personio.de/",
      help: {
        en: "A company board on jobs.personio.de or jobs.personio.com. Its public jobs feed must be enabled.",
        nl: "Een vacaturesite op jobs.personio.de of jobs.personio.com. De openbare vacaturefeed moet ingeschakeld zijn.",
        fr: "Un site d’emploi sur jobs.personio.de ou jobs.personio.com. Son flux public d’offres doit être activé.",
      },
    },
    language: {
      label: {
        en: "Feed language",
        nl: "Taal van de feed",
        fr: "Langue du flux",
      },
      help: {
        en: "en: English; de: German; fr: French; es: Spanish; nl: Dutch; it: Italian; pt: Portuguese. Descriptions may be empty when a translation is unavailable.",
        nl: "en: Engels; de: Duits; fr: Frans; es: Spaans; nl: Nederlands; it: Italiaans; pt: Portugees. Omschrijvingen kunnen ontbreken als er geen vertaling is.",
        fr: "en : anglais ; de : allemand ; fr : français ; es : espagnol ; nl : néerlandais ; it : italien ; pt : portugais. Les descriptions peuvent être vides si la traduction est indisponible.",
      },
    },
  },
  sampleItem: {
    title: "Engineer",
    location: "Munich",
    department: "Engineering",
    url: "https://demo.jobs.personio.de/job/1822269?language=en",
    postedAt: null,
    description: "Build useful tools.",
    applyUrl: "https://demo.jobs.personio.de/job/1822269/apply?language=en",
    employmentType: "permanent · full-time",
    workplaceType: null,
    descriptionTruncated: false,
  },
  limits: { maxPages: 5, maxItems: 5000, maxDurationMs: 60_000 },
  async *run(input, ctx) {
    const board = recognizePersonioBoard(new URL(input.url));
    if (!board)
      throw new Error("Personio input must be validated before execution");
    const res = await ctx.fetch(personioFeedUrl(board, input.language), {
      accept: "application/xml,text/xml",
    });
    if (res.status === 404)
      throw new CollectorStop(
        "error",
        "failed",
        "The public Personio jobs feed is unavailable.",
        { code: "personio_feed_unavailable" },
      );
    if (res.status < 200 || res.status >= 300)
      throw new CollectorStop(
        "error",
        "failed",
        `The job board answered with status ${res.status}.`,
        { code: "board_status", params: { status: res.status } },
      );
    const document = await ctx.parseXml({
      xml: await res.text(),
      url: res.url,
    });
    const rows = parsePersonioBoard(document, board, input.language);
    if (!rows)
      throw new CollectorStop(
        "error",
        "failed",
        "The job board returned an unreadable jobs list.",
        { code: "board_response_invalid" },
      );
    ctx.log(`Found ${rows.length} ${rows.length === 1 ? "job" : "jobs"}.`);
    for (const { descriptionMarkup, ...row } of rows) {
      if (descriptionMarkup) {
        const extracted = await ctx.extractText({
          html: descriptionMarkup.html,
          url: row.url,
        });
        row.description = extracted.text;
        row.descriptionTruncated = extracted.truncated;
      }
      yield row;
    }
  },
};
