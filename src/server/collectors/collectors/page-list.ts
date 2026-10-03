import { z } from "zod";

import {
  checkSelector,
  MAX_COMPOUNDS,
  MAX_SELECTOR_LENGTH,
  type SelectorProblem,
} from "@/lib/collectors/selector-policy";

import type { Collector } from "../collector";
import { CollectorStop } from "../errors";

const PAGE_ACCEPT = "text/html,application/xhtml+xml";

/** Content types read as a web page. A missing type counts as one. */
const HTML_TYPES = ["text/html", "application/xhtml+xml"];

/** Why a selector was refused, in words a member can act on. */
const SELECTOR_MESSAGES: Record<SelectorProblem, string> = {
  empty: "Enter a selector.",
  too_long: `This selector is too long. Use at most ${MAX_SELECTOR_LENGTH} characters.`,
  invalid: "This is not a valid CSS selector.",
  list: "Use one selector here, without commas.",
  too_complex: `This selector has too many parts. Use at most ${MAX_COMPOUNDS}.`,
  not_allowed:
    "This selector uses a feature we don't allow. Use tag names, classes, ids and attributes.",
};

/** A CSS selector that passes the allowlist (selector-policy.ts). */
const selector = z.string().superRefine((value, ctx) => {
  const check = checkSelector(value);
  if (!check.ok) {
    ctx.addIssue({ code: "custom", message: SELECTOR_MESSAGES[check.reason] });
  }
});

const column = z.object({
  name: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/,
      "Start the column name with a letter; use only letters, digits and _ (at most 40).",
    ),
  selector,
  attribute: z
    .string()
    .regex(
      /^[a-zA-Z_:][-a-zA-Z0-9_:.]{0,39}$/,
      "This is not a valid attribute name.",
    )
    .optional(),
});

const inputSchema = z.object({
  url: z.url({ protocol: /^https$/ }).max(2_048),
  itemSelector: selector,
  fields: z
    .array(column)
    .min(1, "Add at least one column.")
    .max(20, "Use at most 20 columns.")
    .superRefine((columns, ctx) => {
      const seen = new Set<string>();
      columns.forEach((c, i) => {
        if (seen.has(c.name)) {
          ctx.addIssue({
            code: "custom",
            path: [i, "name"],
            message: "Each column needs its own name.",
          });
        }
        seen.add(c.name);
      });
    }),
  nextPageSelector: selector.optional(),
  maxPages: z.number().int().min(1).max(20).default(5),
});

type PageListInput = z.infer<typeof inputSchema>;
type PageRow = Record<string, string | null>;

const itemSchema = z.record(z.string(), z.string().nullable());

function isHtml(contentType: string | null): boolean {
  if (contentType === null || contentType.trim() === "") return true;
  const mediaType = contentType.split(";")[0]!.trim().toLowerCase();
  return HTML_TYPES.includes(mediaType);
}

/** The page a URL names, for the visited set: http(s) only, no `#hash`. */
function pageKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  parsed.hash = "";
  return parsed.href;
}

export const pageList: Collector<PageListInput, PageRow> = {
  id: "page-list",
  version: 1,
  author: "platform",
  kind: "page",
  title: { en: "List on a web page", nl: "Lijst op een webpagina" },
  description: {
    en: "The items of a list on a web page, such as job openings or events, with the columns you choose. Can follow a next-page link.",
    nl: "De items van een lijst op een webpagina, zoals vacatures of evenementen, met de kolommen die jij kiest. Kan een link naar de volgende pagina volgen.",
  },
  inputSchema,
  itemSchema,
  fieldHints: {
    url: {
      label: { en: "Page address", nl: "Adres van de pagina" },
      help: {
        en: "The web address of the page with the list.",
        nl: "Het webadres van de pagina met de lijst.",
      },
      placeholder: "https://example.com/jobs",
    },
    itemSelector: {
      label: { en: "Item selector", nl: "Selector voor een item" },
      help: {
        en: "A CSS selector that matches one item of the list. Each match becomes one row.",
        nl: "Een CSS-selector die één item van de lijst vindt. Elk gevonden item wordt één rij.",
      },
      placeholder: "li.job",
    },
    fields: {
      label: { en: "Columns", nl: "Kolommen" },
      help: {
        en: "What to read from each item. Each column has a name and a CSS selector inside the item.",
        nl: "Wat je uit elk item wilt halen. Elke kolom heeft een naam en een CSS-selector binnen het item.",
      },
      columns: {
        name: {
          label: { en: "Column name", nl: "Naam van de kolom" },
          help: {
            en: "Letters, digits and _; start with a letter.",
            nl: "Letters, cijfers en _; begin met een letter.",
          },
          placeholder: "title",
        },
        selector: {
          label: { en: "Selector", nl: "Selector" },
          help: {
            en: "Where the value sits inside the item.",
            nl: "Waar de waarde in het item staat.",
          },
          placeholder: "h3 a",
        },
        attribute: {
          label: { en: "Attribute", nl: "Attribuut" },
          help: {
            en: "Leave empty to read the text. Use href for a link's address.",
            nl: "Laat leeg om de tekst te lezen. Gebruik href voor het adres van een link.",
          },
          placeholder: "href",
        },
      },
    },
    nextPageSelector: {
      label: { en: "Next-page link", nl: "Link naar de volgende pagina" },
      help: {
        en: "Optional. A CSS selector for the link to the next page of the list.",
        nl: "Niet verplicht. Een CSS-selector voor de link naar de volgende pagina van de lijst.",
      },
      placeholder: "a.next",
    },
    maxPages: {
      label: { en: "Pages to read", nl: "Aantal pagina's" },
      help: {
        en: "How many pages to read at most, from 1 to 20.",
        nl: "Hoeveel pagina's we hooguit lezen, van 1 tot 20.",
      },
      placeholder: "5",
    },
  },
  sampleItem: {
    title: "Frontend engineer",
    link: "https://example.com/jobs/frontend-engineer",
    location: null,
  },
  limits: { maxPages: 20, maxItems: 5_000, maxDurationMs: 120_000 },
  async *run(input, ctx) {
    const spec = {
      itemSelector: input.itemSelector,
      fields: input.fields,
      nextPageSelector: input.nextPageSelector,
    };
    const visited = new Set<string>();
    let url = input.url;
    // `n` counts pages read, not requests: redirect hops and 429/503 retries
    // count toward the context's own page budget (limits.maxPages), so a run
    // may end with page_limit before input.maxPages pages.
    for (let n = 1; ; n += 1) {
      const key = pageKey(url);
      if (key === null || visited.has(key)) return;
      if (n > input.maxPages) {
        throw new CollectorStop(
          "page_limit",
          "succeeded",
          "Stopped at the page limit.",
        );
      }
      visited.add(key);

      const res = await ctx.fetch(url, { accept: PAGE_ACCEPT });
      if (res.status < 200 || res.status >= 300) {
        throw new CollectorStop(
          "error",
          "failed",
          `The page answered with status ${res.status}.`,
          { code: "page_status", params: { status: res.status } },
        );
      }
      if (!isHtml(res.headers.get("content-type"))) {
        throw new CollectorStop(
          "error",
          "failed",
          "This address is not a web page.",
          { code: "not_a_page" },
        );
      }
      // A redirect onto a page already read would repeat its rows: stop.
      const landed = pageKey(res.url);
      if (landed !== null && landed !== key) {
        if (visited.has(landed)) return;
        visited.add(landed);
      }

      const { rows, nextUrl, truncated } = await ctx.extractList(
        { html: await res.text(), url: res.url },
        spec,
      );
      ctx.log(`Page ${n}: ${rows.length} items.`);
      if (truncated) {
        ctx.log(
          `Page ${n} had more than we can keep, so some items were left out.`,
        );
      }
      yield* rows;
      if (nextUrl === null) return;
      url = nextUrl;
    }
  },
};
