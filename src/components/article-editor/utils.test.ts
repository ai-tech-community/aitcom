import { describe, expect, it } from "vitest";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import {
  filterSlashCommands,
  postprocessEditorState,
  preprocessEditorState,
} from "./utils";

const EMBED = { blockType: "Embed", nodeType: "embed" };
const stored = {
  root: {
    children: [
      {
        type: "block",
        fields: {
          blockType: "Embed",
          url: "https://youtu.be/dQw4w9WgXcQ",
          id: "a",
        },
      },
      { type: "block", fields: { blockType: "Code", code: "x" } },
    ],
  },
} as unknown as SerializedEditorState;

describe("block ↔ node remapping", () => {
  it("keeps today's behaviour without extensions", () => {
    const pre = JSON.parse(preprocessEditorState(stored)!);
    expect(pre.root.children.map((n: { type: string }) => n.type)).toEqual([
      "block",
      "code-block",
    ]);
  });

  it("maps extension blocks to their node type and back", () => {
    const pre = JSON.parse(preprocessEditorState(stored, [EMBED])!);
    expect(pre.root.children.map((n: { type: string }) => n.type)).toEqual([
      "embed",
      "code-block",
    ]);
    const post = postprocessEditorState(pre, [EMBED]) as unknown as {
      root: { children: { type: string }[] };
    };
    expect(post.root.children.map((n) => n.type)).toEqual(["block", "block"]);
  });
});

describe("filterSlashCommands with extra commands", () => {
  const extra = [
    {
      id: "embed",
      label: "Embed slides or video",
      group: "Basic" as const,
      keywords: ["youtube", "slides"],
    },
  ];

  it("finds an extra command by keyword", () => {
    expect(filterSlashCommands("slides", extra).map((c) => c.id)).toContain(
      "embed",
    );
  });

  it("does not add extra commands when none are passed", () => {
    expect(filterSlashCommands("").map((c) => c.id)).not.toContain("embed");
  });
});
