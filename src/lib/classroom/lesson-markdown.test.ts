import { expect, it } from "vitest";

import { plainTextToLexical } from "@/server/challenge-engine/lexical";

import {
  lessonMarkdownNeedsResave,
  lessonMarkdownSource,
  lessonMarkdownToLexical,
} from "./lesson-markdown";

const markdown = [
  "## Goals",
  "- Say the Dutch alphabet",
  "- Tell long and short vowels apart",
  "",
  "| Dutch | English |",
  "|---|---|",
  "| een | one |",
  "",
  "```",
  "A: Hoe spel je 'huis'?",
  "B: H-U-I-S.",
  "```",
  "",
  "See the [alphabet](https://example.com/alphabet).",
].join("\n");

it("stores each markdown line, including blank lines, without joining them", () => {
  const stored = lessonMarkdownToLexical(markdown);
  const lines = stored.root.children.map((paragraph) => {
    const children = paragraph.children as { text?: string }[] | undefined;
    return children?.[0]?.text;
  });
  expect(lines).toEqual(markdown.split("\n"));
  expect(lines.some((line) => line?.includes("\n"))).toBe(false);
  expect(lessonMarkdownSource(stored)).toBe(markdown);
});

it("keeps a Windows newline as a line break in the stored markdown", () => {
  const stored = lessonMarkdownToLexical("## Goals\r\n- Say hello");
  expect(lessonMarkdownSource(stored)).toBe("## Goals\n- Say hello");
});

it("reads a lesson saved with newlines inside each paragraph", () => {
  const stored = plainTextToLexical(markdown);
  const firstNode = stored.root.children[0] as
    | { children?: { text?: string }[] }
    | undefined;
  const first = firstNode?.children?.[0]?.text ?? "";
  expect(first).toContain("\n");
  expect(first.startsWith("## Goals")).toBe(true);
  expect(lessonMarkdownSource(stored)).toBe(markdown);
  expect(lessonMarkdownNeedsResave(stored)).toBe(false);
});

it("does not invent line breaks when they were already replaced with spaces", () => {
  const stored = {
    root: {
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              format: 0,
              text: "## Goals - Say hello | Dutch | English | |---|---| | een | one | ``` A: Hi ```",
            },
          ],
        },
      ],
    },
  };
  expect(lessonMarkdownNeedsResave(stored)).toBe(true);
  expect(lessonMarkdownSource(stored)).toBeNull();
});

it("leaves a rich-text lesson on the lexical renderer", () => {
  const stored = {
    root: {
      children: [
        {
          type: "heading",
          tag: "h2",
          children: [{ type: "text", text: "Goals", format: 0 }],
        },
      ],
    },
  };
  expect(lessonMarkdownSource(stored)).toBeNull();
  expect(lessonMarkdownNeedsResave(stored)).toBe(false);
});

it("leaves ordinary prose paragraphs as rich text", () => {
  const stored = plainTextToLexical("Hello there.\n\nSee you tomorrow.");
  expect(lessonMarkdownSource(stored)).toBeNull();
});
