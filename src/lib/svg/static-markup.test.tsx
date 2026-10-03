// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BadgeEmblem,
  emblemStyleOf,
  type EmblemSubject,
} from "@/components/badges/badge-emblem";
import { emblemPalette } from "@/lib/badges/emblem-palette";

import { staticSvgMarkup, svgDataUrl } from "./static-markup";

const SUBJECTS: EmblemSubject[] = [
  { kind: "badge", slug: "writer_3" },
  { kind: "badge", slug: "prolific_writer" },
  { kind: "badge", slug: "first_event" },
  { kind: "badge", slug: "profile_complete" },
  { kind: "badge", slug: "early_adopter" },
  { kind: "award", label: "Winner" },
];

function emblem(subject: EmblemSubject) {
  return (
    <BadgeEmblem
      subject={subject}
      state={{ earned: true, earnedAt: null }}
      size="lg"
      palette={emblemPalette(emblemStyleOf(subject), "dark")}
    />
  );
}

describe("staticSvgMarkup", () => {
  it.each(SUBJECTS)("draws the same markup as React for %o", (subject) => {
    const ours = staticSvgMarkup(emblem(subject));
    const react = renderToStaticMarkup(emblem(subject)).replace(
      /^<svg/,
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
    expect(ours).toBe(react);
  });

  it("references no CSS custom property and has no hover sheen with a palette", () => {
    for (const subject of SUBJECTS) {
      const markup = staticSvgMarkup(emblem(subject));
      expect(markup).not.toContain("var(");
      expect(markup).not.toContain("clipPath");
      expect(markup).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    }
  });

  it("escapes text and attribute values", () => {
    expect(
      staticSvgMarkup(
        <svg aria-label={'a "b" & <c>'}>
          <text>{"x < y"}</text>
        </svg>,
      ),
    ).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" aria-label="a &quot;b&quot; &amp; &lt;c&gt;"><text>x &lt; y</text></svg>',
    );
  });

  it("builds a base64 data URL", () => {
    expect(svgDataUrl("<svg/>")).toBe(
      `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
    );
  });
});
