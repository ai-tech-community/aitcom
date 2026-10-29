import { expect, it } from "vitest";

import {
  EditorialSyntaxError,
  editorialBlockNode,
  segmentEditorialBody,
} from "./editorial-blocks";

const COAT = "https://cdn.example.test/coat.jpg";
const ROOM = "https://cdn.example.test/room.jpg";

it("reads a pull quote, a captioned photo, a gallery, and a spread", () => {
  const segments = segmentEditorialBody(
    [
      "The season opened quietly.",
      ":::pullquote",
      "Cloth remembers the body that left it.",
      "— Mira Chen",
      ":::",
      `![Evening coat](${COAT} "Wool, 1998")`,
      ":::gallery",
      `![The coat](${COAT} "Front")`,
      `![The room](${ROOM})`,
      ":::",
      ":::spread",
      `![Before](${COAT} "Before")`,
      `![After](${ROOM} "After")`,
      ":::",
      "## The fitting",
    ].join("\n"),
  );
  const prose = segments.flatMap((segment) =>
    segment.kind === "prose" ? [segment.text] : [],
  );
  const blocks = segments.flatMap((segment) =>
    segment.kind === "block" ? [segment.block] : [],
  );
  expect(prose).toEqual(["The season opened quietly.", "## The fitting"]);
  expect(blocks).toEqual([
    {
      type: "pullQuote",
      quote: "Cloth remembers the body that left it.",
      attribution: "Mira Chen",
    },
    {
      type: "captionedImage",
      image: { src: COAT, alt: "Evening coat", caption: "Wool, 1998" },
    },
    {
      type: "gallery",
      images: [
        { src: COAT, alt: "The coat", caption: "Front" },
        { src: ROOM, alt: "The room" },
      ],
    },
    {
      type: "spread",
      left: { src: COAT, alt: "Before", caption: "Before" },
      right: { src: ROOM, alt: "After", caption: "After" },
    },
  ]);
  const quote = editorialBlockNode(blocks[0]!);
  expect(quote.fields.blockType).toBe("PullQuote");
  expect(quote.fields.quote).toBe("Cloth remembers the body that left it.");
  const spread = editorialBlockNode(blocks[3]!);
  expect(spread.fields).toMatchObject({
    blockType: "Spread",
    leftAlt: "Before",
    rightAlt: "After",
  });
});

it("refuses a photo without alt text and a gallery of one", () => {
  expect(() => segmentEditorialBody(`![](${COAT})`)).toThrow(
    EditorialSyntaxError,
  );
  expect(() =>
    segmentEditorialBody([":::gallery", `![Only](${COAT})`, ":::"].join("\n")),
  ).toThrow(/at least two/);
  expect(() => segmentEditorialBody(":::pullquote\nStill open")).toThrow(
    /Close the editorial block/,
  );
});
