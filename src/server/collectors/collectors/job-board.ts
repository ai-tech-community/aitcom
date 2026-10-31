import { z } from "zod";

import {
  greenhouseBoardUrl,
  parseGreenhouseBoard,
} from "@/lib/job-boards/greenhouse";
import { ashbyBoardUrl, parseAshbyBoard } from "@/lib/job-boards/ashby";
import {
  leverBoardUrl,
  parseLeverBoard,
  LEVER_PAGE_SIZE,
} from "@/lib/job-boards/lever";
import {
  workableBoardUrl,
  parseWorkableBoard,
} from "@/lib/job-boards/workable";
import { jobBoardName, jobBoardRowSchema } from "@/lib/job-boards/job-board";

import type { Collector } from "../collector";
import { CollectorStop } from "../errors";

const inputSchema = z.object({
  board: z.enum(["greenhouse", "ashby", "lever", "lever-eu", "workable"]),
  name: jobBoardName,
});

const BOARDS = {
  greenhouse: {
    host: "boards.greenhouse.io",
    url: greenhouseBoardUrl,
    parse: parseGreenhouseBoard,
    pageSize: null,
  },
  ashby: {
    host: "jobs.ashbyhq.com",
    url: ashbyBoardUrl,
    parse: parseAshbyBoard,
    pageSize: null,
  },
  lever: {
    host: "jobs.lever.co",
    url: (name: string, skip = 0) => leverBoardUrl(name, "lever", skip),
    parse: parseLeverBoard,
    pageSize: LEVER_PAGE_SIZE,
  },
  "lever-eu": {
    host: "jobs.eu.lever.co",
    url: (name: string, skip = 0) => leverBoardUrl(name, "lever-eu", skip),
    parse: parseLeverBoard,
    pageSize: LEVER_PAGE_SIZE,
  },
  workable: {
    host: "apply.workable.com",
    url: workableBoardUrl,
    parse: parseWorkableBoard,
    pageSize: null,
  },
} as const;

function invalidResponse(): CollectorStop {
  return new CollectorStop(
    "error",
    "failed",
    "The job board returned an unreadable jobs list.",
    {
      code: "board_response_invalid",
    },
  );
}

export const jobBoard: Collector<
  z.infer<typeof inputSchema>,
  z.infer<typeof jobBoardRowSchema>
> = {
  id: "job-board",
  version: 5,
  author: "platform",
  kind: "api",
  title: { en: "Job board", nl: "Vacaturesite", fr: "Site d’emploi" },
  description: {
    en: "Published jobs from a company's Greenhouse, Ashby, Lever or Workable board, with locations, departments and links.",
    nl: "Gepubliceerde vacatures van een Greenhouse-, Ashby-, Lever- of Workable-vacaturesite, met locaties, afdelingen en links.",
    fr: "Les offres publiées sur le site Greenhouse, Ashby, Lever ou Workable d’une entreprise, avec lieux, services et liens.",
  },
  inputSchema,
  itemSchema: jobBoardRowSchema,
  fieldHints: {
    board: {
      label: { en: "Job board", nl: "Vacaturesite", fr: "Site d’emploi" },
    },
    name: {
      label: {
        en: "Board name",
        nl: "Naam van de vacaturesite",
        fr: "Nom du site d’emploi",
      },
      help: {
        en: "The company name in the job board address. You can also paste the full link in the sidebar.",
        nl: "De bedrijfsnaam in het adres van de vacaturesite. Je kunt ook de volledige link in de zijbalk plakken.",
        fr: "Le nom de l’entreprise dans l’adresse du site d’emploi. Vous pouvez aussi coller le lien complet dans la barre latérale.",
      },
      placeholder: "acme",
    },
  },
  sampleItem: {
    title: "Research engineer",
    location: "Amsterdam",
    department: "Engineering",
    url: "https://boards.greenhouse.io/acme/jobs/123",
    postedAt: null,
    description: "Help our research team build useful tools.",
    applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
    employmentType: "FullTime",
    workplaceType: "Hybrid",
    descriptionTruncated: false,
  },
  limits: { maxPages: 5, maxItems: 5_000, maxDurationMs: 60_000 },
  async *run(input, ctx) {
    const board = BOARDS[input.board];
    const seen = new Set<string>();
    for (let page = 0; ; page++) {
      const res = await ctx.fetch(
        board.url(input.name, page * (board.pageSize ?? 0)),
        {
          accept: "application/json",
        },
      );
      if (res.status === 404) {
        throw new CollectorStop(
          "error",
          "failed",
          `We couldn't find this job board on ${board.host}.`,
          {
            code: "board_not_found",
            params: { host: board.host },
          },
        );
      }
      if (res.status < 200 || res.status >= 300) {
        throw new CollectorStop(
          "error",
          "failed",
          `The job board answered with status ${res.status}.`,
          {
            code: "board_status",
            params: { status: res.status },
          },
        );
      }
      let payload: unknown;
      try {
        payload = await res.json();
      } catch (err) {
        if (err instanceof SyntaxError) throw invalidResponse();
        throw err;
      }
      const rows = board.parse(payload);
      if (rows === null) throw invalidResponse();
      const count = `${rows.length} ${rows.length === 1 ? "job" : "jobs"}`;
      ctx.log(
        board.pageSize ? `Page ${page + 1}: ${count}.` : `Found ${count}.`,
      );
      for (const { descriptionMarkup, ...row } of rows) {
        if (board.pageSize && seen.has(row.url)) continue;
        seen.add(row.url);
        if (descriptionMarkup) {
          const extracted = await ctx.extractText(
            { html: descriptionMarkup.html, url: row.url },
            { decodeEntities: descriptionMarkup.encoded },
          );
          row.description = extracted.text;
          row.descriptionTruncated = extracted.truncated;
        }
        yield row;
      }
      if (!board.pageSize || rows.length < board.pageSize) return;
      if (page + 1 >= jobBoard.limits.maxPages) {
        throw new CollectorStop(
          "page_limit",
          "succeeded",
          "Stopped at the page limit; the collected jobs are available.",
        );
      }
    }
  },
};
