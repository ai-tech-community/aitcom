import { z } from "zod";

import {
  greenhouseBoardName,
  greenhouseBoardUrl,
  jobBoardRowSchema,
  parseGreenhouseBoard,
} from "@/lib/job-boards/greenhouse";

import type { Collector } from "../collector";
import { CollectorStop } from "../errors";

const inputSchema = z.object({
  board: z.enum(["greenhouse"]),
  name: greenhouseBoardName,
});

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
  version: 1,
  author: "platform",
  kind: "api",
  title: { en: "Job board", nl: "Vacaturesite", fr: "Site d’emploi" },
  description: {
    en: "Published jobs from a company's Greenhouse board, with locations, departments and links.",
    nl: "Gepubliceerde vacatures van een Greenhouse-vacaturesite, met locaties, afdelingen en links.",
    fr: "Les offres publiées sur le site Greenhouse d’une entreprise, avec lieux, services et liens.",
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
        en: "The company name in the board address: acme in https://boards.greenhouse.io/acme. You can also paste the full link in the sidebar.",
        nl: "De bedrijfsnaam in het adres: acme in https://boards.greenhouse.io/acme. Je kunt ook de volledige link in de zijbalk plakken.",
        fr: "Le nom de l’entreprise dans l’adresse : acme dans https://boards.greenhouse.io/acme. Vous pouvez aussi coller le lien complet dans la barre latérale.",
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
    const res = await ctx.fetch(greenhouseBoardUrl(input.name), {
      accept: "application/json",
    });
    if (res.status === 404) {
      throw new CollectorStop(
        "error",
        "failed",
        "We couldn't find this Greenhouse board.",
        {
          code: "board_not_found",
          params: { host: "boards.greenhouse.io" },
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
    const rows = parseGreenhouseBoard(payload);
    if (rows === null) throw invalidResponse();
    ctx.log(`Found ${rows.length} ${rows.length === 1 ? "job" : "jobs"}.`);
    yield* rows;
  },
};
