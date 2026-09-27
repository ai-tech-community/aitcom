import { describe, expect, it } from "vitest";
import {
  collectEmbedUrls,
  embedBlockNode,
  invalidEmbedUrls,
  planYoutubeMigration,
  prependEmbedBlock,
} from "./lesson-body";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const para = (text: string) => ({
  type: "paragraph",
  version: 1,
  children: [{ type: "text", version: 1, text }],
});
const root = (children: unknown[]) => ({
  root: { type: "root", format: "", indent: 0, version: 1, direction: null, children },
});

describe("embedBlockNode", () => {
  it("builds the stored Payload block shape", () => {
    expect(embedBlockNode(YT, "abc123abc123")).toEqual({
      type: "block",
      version: 2,
      format: "",
      fields: { id: "abc123abc123", blockName: "", blockType: "Embed", url: YT },
    });
  });
});

describe("collectEmbedUrls / invalidEmbedUrls", () => {
  const body = root([
    para("intro"),
    embedBlockNode(YT, "a"),
    { type: "list", children: [{ type: "listitem", children: [embedBlockNode("https://evil.test/x", "b")] }] },
    { type: "block", fields: { blockType: "Image", src: "https://x.test/i.png" } },
  ]);

  it("finds Embed links at any depth and ignores other blocks", () => {
    expect(collectEmbedUrls(body)).toEqual([YT, "https://evil.test/x"]);
  });

  it("reports only links the registry can't embed", () => {
    expect(invalidEmbedUrls(body)).toEqual(["https://evil.test/x"]);
  });

  it("accepts a JSON string body", () => {
    expect(collectEmbedUrls(JSON.stringify(body))).toHaveLength(2);
  });

  it.each([null, undefined, "", "not json", 42, {}, { root: {} }])(
    "tolerates %p",
    (b) => {
      expect(collectEmbedUrls(b)).toEqual([]);
    },
  );

  it("treats an Embed block without a string url as invalid", () => {
    const bad = root([{ type: "block", fields: { blockType: "Embed", url: 5 } }]);
    expect(invalidEmbedUrls(bad)).toEqual([""]);
  });
});

describe("prependEmbedBlock", () => {
  it("puts the block first and keeps existing children", () => {
    const out = prependEmbedBlock(root([para("notes")]), YT, "id1");
    expect(out.root.children).toEqual([embedBlockNode(YT, "id1"), para("notes")]);
  });

  it("creates a root for an empty body", () => {
    const out = prependEmbedBlock(null, YT, "id1");
    expect(out).toEqual(root([embedBlockNode(YT, "id1")]));
  });

  it("does not mutate its input", () => {
    const input = root([para("notes")]);
    const copy = JSON.parse(JSON.stringify(input));
    prependEmbedBlock(input, YT, "id1");
    expect(input).toEqual(copy);
  });
});

describe("planYoutubeMigration", () => {
  const base = { body: root([para("notes")]), resourceUrls: [], blockId: "id1" };

  it("embeds a link the registry understands", () => {
    expect(planYoutubeMigration({ ...base, youtubeUrl: ` ${YT} ` })).toEqual({
      kind: "embed",
      body: prependEmbedBlock(base.body, YT, "id1"),
    });
  });

  it("keeps a non-embeddable link as a resource", () => {
    expect(
      planYoutubeMigration({ ...base, youtubeUrl: "https://zoom.us/rec/share/abc" }),
    ).toEqual({ kind: "resource", label: "Video", url: "https://zoom.us/rec/share/abc" });
  });

  it("is idempotent", () => {
    const migrated = prependEmbedBlock(base.body, YT, "id1");
    expect(planYoutubeMigration({ ...base, body: migrated, youtubeUrl: YT })).toEqual({ kind: "skip" });
    expect(
      planYoutubeMigration({ ...base, youtubeUrl: "https://zoom.us/rec/share/abc", resourceUrls: ["https://zoom.us/rec/share/abc"] }),
    ).toEqual({ kind: "skip" });
  });

  it.each([null, "", "   "])("skips an empty youtubeUrl %p", (youtubeUrl) => {
    expect(planYoutubeMigration({ ...base, youtubeUrl })).toEqual({ kind: "skip" });
  });
});
