import { z } from "zod";

import {
  greenhouseBoardUrl,
  parseGreenhouseBoard,
} from "@/lib/job-boards/greenhouse";
import { ashbyBoardUrl, parseAshbyBoard } from "@/lib/job-boards/ashby";
import { jobBoardName, jobBoardRowSchema } from "@/lib/job-boards/job-board";

import type { Collector } from "../collector";
import { CollectorStop } from "../errors";

const inputSchema = z.object({
  board: z.enum(["greenhouse", "ashby"]),
  name: jobBoardName,
});

const BOARDS = {
  greenhouse: {
    host: "boards.greenhouse.io",
    url: greenhouseBoardUrl,
    parse: parseGreenhouseBoard,
  },
  ashby: {
    host: "jobs.ashbyhq.com",
    url: ashbyBoardUrl,
    parse: parseAshbyBoard,
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
  version: 2,
  author: "platform",
  kind: "api",
  title: { en: "Job board", nl: "Vacaturesite", fr: "Site d’emploi" },
  description: {
    en: "Published jobs from a company's Greenhouse or Ashby board, with locations, departments and links.",
    nl: "Gepubliceerde vacatures van een Greenhouse- of Ashby-vacaturesite, met locaties, afdelingen en links.",
    fr: "Les offres publiées sur le site Greenhouse ou Ashby d’une entreprise, avec lieux, services et liens.",
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
  },
  limits: { maxPages: 5, maxItems: 5_000, maxDurationMs: 60_000 },
  async *run(input, ctx) {
    const board = BOARDS[input.board];
    const res = await ctx.fetch(board.url(input.name), {
      accept: "application/json",
    });
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
    ctx.log(`Found ${rows.length} ${rows.length === 1 ? "job" : "jobs"}.`);
    yield* rows;
  },
};
