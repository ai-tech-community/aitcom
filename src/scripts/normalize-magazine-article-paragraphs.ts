/**
 * Dry-run report of magazine articles whose stored body has empty paragraphs.
 *
 * Those paragraphs came from the agent markdown import (every blank line
 * became a paragraph) and from editor leftovers beside lists and callouts.
 * The site now hides them on load and on the public page. This script is the
 * optional one-off that writes the cleaned body back. It does not change
 * title, status, review, or publish state.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/normalize-magazine-article-paragraphs.ts
 *   pnpm exec tsx --env-file=.env src/scripts/normalize-magazine-article-paragraphs.ts --write
 *
 * Default is a dry run. Do not pass --write until the report looks right.
 */

import {
  countEmptyParagraphs,
  normalizeStoredContent,
  type LexicalLikeNode,
} from "@/lib/lexical-blocks";
import type { Article } from "@/payload-types";
import { getPayloadClient } from "@/server/payload";

const write = process.argv.includes("--write");
const LOCALES = ["en", "nl"] as const;

function childrenOf(content: unknown): LexicalLikeNode[] {
  const children = (content as { root?: { children?: LexicalLikeNode[] } })
    ?.root?.children;
  return Array.isArray(children) ? children : [];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing. Run with --env-file=.env");
    process.exit(1);
  }
  const payload = await getPayloadClient();
  let examined = 0;
  let dirty = 0;
  let written = 0;

  for (const locale of LOCALES) {
    for (const draft of [false, true]) {
      const { docs } = await payload.find({
        collection: "articles",
        where: { magazine: { exists: true } },
        locale,
        fallbackLocale: false,
        draft,
        depth: 0,
        pagination: false,
        limit: 1000,
      });
      for (const doc of docs) {
        examined += 1;
        const before = countEmptyParagraphs(childrenOf(doc.content));
        const next = normalizeStoredContent(doc.content);
        const after = countEmptyParagraphs(childrenOf(next));
        if (JSON.stringify(doc.content) === JSON.stringify(next)) continue;
        dirty += 1;
        console.log(
          `${write ? "write" : "dry-run"}\t${doc.id}\t${doc.slug}\t${locale}\t${draft ? "draft" : "published"}\tempty ${before} -> ${after}`,
        );
        if (!write) continue;
        await payload.update({
          collection: "articles",
          id: doc.id,
          locale,
          draft,
          data: { content: next as Article["content"] },
        });
        written += 1;
      }
    }
  }

  console.log(
    `${write ? "updated" : "would update"} ${dirty} of ${examined} locale rows` +
      (write ? ` (${written} written)` : "") +
      ". Empty paragraphs are removed; callouts stay [!INFO] paragraphs.",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
