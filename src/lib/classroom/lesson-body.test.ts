import { describe, expect, it } from "vitest";
import {
  collectEmbedUrls,
  collectMaterialIds,
  embedBlockNode,
  hostedFileBlockNode,
  invalidEmbedUrls,
  isMaterialId,
  planYoutubeMigration,
  prependEmbedBlock,
  stripIncompleteMaterials,
} from "./lesson-body";

const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const para = (text: string) => ({
  type: "paragraph",
  version: 1,
  children: [{ type: "text", version: 1, text }],
});
const root = (children: unknown[]) => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children,
  },
});

describe("embedBlockNode", () => {
  it("builds the stored Payload block shape", () => {
    expect(embedBlockNode(YT, "abc123abc123")).toEqual({
      type: "block",
      version: 2,
      format: "",
      fields: {
        id: "abc123abc123",
        blockName: "",
        blockType: "Embed",
        url: YT,
      },
    });
  });
});

describe("collectEmbedUrls / invalidEmbedUrls", () => {
  const body = root([
    para("intro"),
    embedBlockNode(YT, "a"),
    {
      type: "list",
      children: [
        {
          type: "listitem",
          children: [embedBlockNode("https://evil.test/x", "b")],
        },
      ],
    },
    {
      type: "block",
      fields: { blockType: "Image", src: "https://x.test/i.png" },
    },
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
    const bad = root([
      { type: "block", fields: { blockType: "Embed", url: 5 } },
    ]);
    expect(invalidEmbedUrls(bad)).toEqual([""]);
  });
});

describe("prependEmbedBlock", () => {
  it("puts the block first and keeps existing children", () => {
    const out = prependEmbedBlock(root([para("notes")]), YT, "id1");
    expect(out.root.children).toEqual([
      embedBlockNode(YT, "id1"),
      para("notes"),
    ]);
  });

  it("creates a root for an empty body", () => {
    const out = prependEmbedBlock(null, YT, "id1");
    expect(out).toEqual(root([embedBlockNode(YT, "id1")]));
  });

  it.each([{ root: "x" }, { root: 7 }, { root: ["x"] }])(
    "replaces a corrupt root ($root) with a fresh one",
    (b) => {
      const out = prependEmbedBlock(b, YT, "id1");
      expect(out).toEqual(root([embedBlockNode(YT, "id1")]));
    },
  );

  it("does not mutate its input", () => {
    const input = root([para("notes")]);
    const copy = JSON.parse(JSON.stringify(input));
    prependEmbedBlock(input, YT, "id1");
    expect(input).toEqual(copy);
  });
});

describe("planYoutubeMigration", () => {
  const base = {
    body: root([para("notes")]),
    resourceUrls: [],
    blockId: "id1",
  };

  it("embeds a link the registry understands", () => {
    expect(planYoutubeMigration({ ...base, youtubeUrl: ` ${YT} ` })).toEqual({
      kind: "embed",
      body: prependEmbedBlock(base.body, YT, "id1"),
    });
  });

  it("keeps a non-embeddable link as a resource", () => {
    expect(
      planYoutubeMigration({
        ...base,
        youtubeUrl: "https://zoom.us/rec/share/abc",
      }),
    ).toEqual({
      kind: "resource",
      label: "Video",
      url: "https://zoom.us/rec/share/abc",
    });
  });

  it("is idempotent", () => {
    const migrated = prependEmbedBlock(base.body, YT, "id1");
    expect(
      planYoutubeMigration({ ...base, body: migrated, youtubeUrl: YT }),
    ).toEqual({ kind: "skip" });
    expect(
      planYoutubeMigration({
        ...base,
        youtubeUrl: "https://zoom.us/rec/share/abc",
        resourceUrls: ["https://zoom.us/rec/share/abc"],
      }),
    ).toEqual({ kind: "skip" });
  });

  it.each([null, "", "   "])("skips an empty youtubeUrl %p", (youtubeUrl) => {
    expect(planYoutubeMigration({ ...base, youtubeUrl })).toEqual({
      kind: "skip",
    });
  });
});

describe("stripIncompleteMaterials", () => {
  const empty = (url: unknown, id: string) => ({
    type: "block",
    version: 2,
    format: "",
    fields: { id, blockName: "", blockType: "Embed", url },
  });

  it("removes Embed blocks with no link, at any depth, and keeps the rest", () => {
    const body = root([
      para("intro"),
      empty("", "a"),
      embedBlockNode(YT, "b"),
      empty("   ", "c"),
      {
        type: "list",
        children: [
          { type: "listitem", children: [empty(undefined, "d"), para("item")] },
        ],
      },
      { type: "block", fields: { blockType: "Image", url: "" } },
    ]);
    expect(stripIncompleteMaterials(body)).toEqual(
      root([
        para("intro"),
        embedBlockNode(YT, "b"),
        {
          type: "list",
          children: [{ type: "listitem", children: [para("item")] }],
        },
        { type: "block", fields: { blockType: "Image", url: "" } },
      ]),
    );
  });

  it("keeps a filled-in link even if it is not embeddable (the server rejects it)", () => {
    const body = root([embedBlockNode("https://evil.test/x", "a")]);
    expect(stripIncompleteMaterials(body)).toEqual(body);
  });

  it("does not mutate its input", () => {
    const input = root([empty("", "a"), para("notes")]);
    const copy = JSON.parse(JSON.stringify(input));
    const out = stripIncompleteMaterials(input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });

  it("works on a stored JSON string", () => {
    const out = stripIncompleteMaterials(
      JSON.stringify(root([empty("", "a"), para("notes")])),
    );
    expect(out).toEqual(root([para("notes")]));
  });

  it.each([null, undefined, 7, "not json", ""])(
    "returns %p unchanged",
    (input) => {
      expect(stripIncompleteMaterials(input)).toBe(input);
    },
  );

  it("returns a body without a root unchanged", () => {
    const input = { notRoot: true };
    expect(stripIncompleteMaterials(input)).toEqual(input);
  });
});

describe("hostedFileBlockNode / collectMaterialIds", () => {
  it("builds the stored Payload block shape", () => {
    expect(hostedFileBlockNode(42, "abc123abc123")).toEqual({
      type: "block",
      version: 2,
      format: "",
      fields: {
        id: "abc123abc123",
        blockName: "",
        blockType: "HostedFile",
        materialId: 42,
      },
    });
  });

  it("finds file ids at any depth, in order, and ignores other blocks", () => {
    const body = root([
      para("intro"),
      hostedFileBlockNode(5, "a"),
      embedBlockNode(YT, "b"),
      {
        type: "list",
        children: [
          {
            type: "listitem",
            children: [
              hostedFileBlockNode(9, "c"),
              hostedFileBlockNode(5, "d"),
            ],
          },
        ],
      },
    ]);
    expect(collectMaterialIds(body)).toEqual([5, 9, 5]);
    expect(collectEmbedUrls(body)).toEqual([YT]);
  });

  it.each([
    ["a string id", "12"],
    ["zero", 0],
    ["a negative id", -1],
    ["a fraction", 1.5],
    ["no id", undefined],
  ])("turns %s into 0", (_label, materialId) => {
    const body = root([
      { type: "block", fields: { blockType: "HostedFile", materialId } },
    ]);
    expect(collectMaterialIds(body)).toEqual([0]);
  });

  it("reads a JSON string body and tolerates junk", () => {
    expect(
      collectMaterialIds(JSON.stringify(root([hostedFileBlockNode(3, "a")]))),
    ).toEqual([3]);
    for (const junk of [
      null,
      undefined,
      "",
      "not json",
      42,
      {},
      { root: {} },
    ]) {
      expect(collectMaterialIds(junk)).toEqual([]);
    }
  });

  it("knows a usable id", () => {
    expect(isMaterialId(1)).toBe(true);
    expect(isMaterialId(0)).toBe(false);
    expect(isMaterialId("1")).toBe(false);
    expect(isMaterialId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });
});

describe("stripIncompleteMaterials: HostedFile blocks", () => {
  const noFile = {
    type: "block",
    version: 2,
    format: "",
    fields: { id: "x", blockName: "", blockType: "HostedFile", materialId: 0 },
  };

  it("drops file blocks that never got a file, at any depth, and keeps the rest", () => {
    const body = root([
      hostedFileBlockNode(7, "a"),
      noFile,
      {
        type: "list",
        children: [{ type: "listitem", children: [noFile, para("item")] }],
      },
    ]);
    expect(stripIncompleteMaterials(body)).toEqual(
      root([
        hostedFileBlockNode(7, "a"),
        {
          type: "list",
          children: [{ type: "listitem", children: [para("item")] }],
        },
      ]),
    );
  });
});
