import React from "react";
import { slugify } from "@/lib/text-utils";

import { extractPlainText } from "./lexical-text";
import { renderLexicalDocument, type BlockRenderers } from "./lexical-view";

export type { BlockRenderers } from "./lexical-view";
export { renderLexicalDocument } from "./lexical-view";

type LexicalNode = {
  type: string;
  text?: string;
  tag?: string;
  children?: LexicalNode[];
};

type LexicalRoot = {
  root?: { children?: LexicalNode[] };
};

// The text rule lives in its own client-safe module; re-exported here for
// the readers that already import it from this one.
export { extractPlainText } from "./lexical-text";

/**
 * Estimate reading time in minutes from Lexical JSON content.
 * Uses 200 WPM average reading speed.
 */
export function estimateReadingTime(content: unknown): number {
  const data =
    typeof content === "string"
      ? (JSON.parse(content) as LexicalRoot)
      : (content as LexicalRoot);

  if (!data?.root?.children) return 1;

  const text = extractPlainText(data.root.children);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export type Heading = { text: string; slug: string; level: 2 | 3 };

/**
 * Extract H2/H3 headings from Lexical JSON content with deduplicated slugs.
 * Used for table of contents and anchor link generation.
 */
export function extractHeadings(content: unknown): Heading[] {
  const data =
    typeof content === "string"
      ? (JSON.parse(content) as LexicalRoot)
      : (content as LexicalRoot);

  if (!data?.root?.children) return [];

  const slugMap = new Map<string, number>();
  const headings: Heading[] = [];

  for (const node of data.root.children) {
    if (node.type === "heading" && (node.tag === "h2" || node.tag === "h3")) {
      const text = extractPlainText(node.children ?? []);
      const baseSlug = slugify(text);
      const count = slugMap.get(baseSlug) ?? 0;
      const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
      slugMap.set(baseSlug, count + 1);

      headings.push({
        text,
        slug,
        level: node.tag === "h2" ? 2 : 3,
      });
    }
  }

  return headings;
}

async function HighlightedCode({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const { codeToHtml } = await import("shiki");
  const lang = language ?? "plaintext";
  let html: string;
  try {
    html = await codeToHtml(code, {
      lang,
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      defaultColor: false,
    });
  } catch {
    // Fall back to unformatted if language not supported
    html = await codeToHtml(code, {
      lang: "plaintext",
      themes: {
        light: "github-light",
        dark: "github-dark-dimmed",
      },
      defaultColor: false,
    });
  }
  return (
    <div
      className="my-4 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Renders Payload Lexical rich text JSON as React elements.
 * Pass the raw `content` field value from a Payload document.
 */
export function LexicalRenderer({
  content,
  blockRenderers,
  editorial = false,
}: {
  content: unknown;
  blockRenderers?: BlockRenderers;
  /** Magazine article body: columns, drop cap, and editorial figures. */
  editorial?: boolean;
}) {
  return renderLexicalDocument(content, {
    blockRenderers,
    editorial,
    renderCode: (code, language) => (
      <HighlightedCode code={code} language={language} />
    ),
  });
}
