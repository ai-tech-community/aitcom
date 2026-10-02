import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { BADGE_CATALOG, BADGE_TRACK_IDS } from "@/lib/badges/catalog";

import {
  BadgeEmblem,
  SHEEN_CLASS,
  type BadgeEmblemProps,
  type EmblemSize,
} from "./badge-emblem";

function renderEmblem(props: BadgeEmblemProps, locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
      timeZone="UTC"
    >
      <BadgeEmblem {...props} />
    </NextIntlClientProvider>,
  );
}

const parts = (svg: Element, part: string) =>
  svg.querySelectorAll(`[data-emblem-part="${part}"]`);

describe("BadgeEmblem", () => {
  it("names an earned tier with its date", () => {
    renderEmblem({
      subject: { kind: "badge", slug: "prolific_writer" },
      state: { earned: true, earnedAt: "2026-03-03T10:00:00Z" },
    });
    expect(
      screen.getByRole("img", {
        name: "Writer, tier II, earned March 3, 2026",
      }),
    ).toBeInTheDocument();
  });

  it("names it in Dutch with a Dutch date", () => {
    renderEmblem(
      {
        subject: { kind: "badge", slug: "prolific_writer" },
        state: { earned: true, earnedAt: "2026-03-03T10:00:00Z" },
      },
      "nl",
    );
    expect(
      screen.getByRole("img", {
        name: "Schrijver, niveau II, verdiend op 3 maart 2026",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    ["article_author", 1, 0],
    ["prolific_writer", 2, 0],
    ["writer_3", 0, 1],
  ] as const)(
    "draws %s with %i hairline rings and %i band",
    (slug, rings, bands) => {
      const { container } = renderEmblem({
        subject: { kind: "badge", slug },
        state: { earned: true, earnedAt: "2026-03-03" },
      });
      const svg = container.querySelector("svg")!;
      expect(parts(svg, "ring")).toHaveLength(rings);
      expect(parts(svg, "band")).toHaveLength(bands);
    },
  );

  it("patterns the tier III band, except at the small size where it would blur", () => {
    for (const [size, patterns] of [
      ["lg", 1],
      ["md", 1],
      ["sm", 0],
    ] as [EmblemSize, number][]) {
      const { container, unmount } = renderEmblem({
        subject: { kind: "badge", slug: "veteran" },
        state: { earned: true, earnedAt: "2026-03-03" },
        size,
      });
      expect(parts(container.querySelector("svg")!, "pattern")).toHaveLength(
        patterns,
      );
      unmount();
    }
  });

  it("draws a locked tier as an outline with its progress traced along it", () => {
    const { container } = renderEmblem({
      subject: { kind: "badge", slug: "writer_3" },
      state: { earned: false, progress: { current: 3, threshold: 15 } },
    });
    const svg = screen.getByRole("img", {
      name: "Writer, tier III, locked, 3 of 15",
    });
    expect(svg).toHaveAttribute("data-state", "locked");
    const arc = parts(svg, "progress")[0]!;
    expect(arc).toHaveAttribute("pathLength", "100");
    expect(arc).toHaveAttribute("stroke-dasharray", "20 100");
    // Outline only: no tinted body, no rings.
    expect(parts(container, "body")).toHaveLength(0);
    expect(parts(container, "ring")).toHaveLength(0);
  });

  it("leaves out the arc with no progress yet, and says only 'locked' without a metric", () => {
    const { container } = renderEmblem({
      subject: { kind: "badge", slug: "profile_complete" },
      state: { earned: false },
    });
    expect(
      screen.getByRole("img", { name: "Profile complete, locked" }),
    ).toBeInTheDocument();
    expect(parts(container, "progress")).toHaveLength(0);
  });

  it("gives limited editions a sheen that only moves when motion is allowed", () => {
    const { container } = renderEmblem({
      subject: { kind: "badge", slug: "early_adopter" },
      state: { earned: true, earnedAt: "2026-03-03" },
    });
    expect(
      screen.getByRole("img", {
        name: "Early adopter, limited edition, earned March 3, 2026",
      }),
    ).toBeInTheDocument();
    const sheen = parts(container, "sheen")[0]!;
    expect(sheen.getAttribute("class")).toBe(SHEEN_CLASS);
    const classes = SHEEN_CLASS.split(" ");
    // Every moving class is behind prefers-reduced-motion: no-preference…
    expect(
      classes.filter((c) => /transition|duration|ease|hover/.test(c)),
    ).toSatisfy(
      (moving: string[]) =>
        moving.length > 0 && moving.every((c) => c.startsWith("motion-safe:")),
    );
    // …and under reduce the sheen rests in place.
    expect(classes.some((c) => c.startsWith("motion-reduce:translate"))).toBe(
      true,
    );
    // References resolve: the clip and gradient ids exist.
    const clip = sheen.closest("g[clip-path]")!.getAttribute("clip-path")!;
    const clipId = /url\(#(.+)\)/.exec(clip)![1]!;
    expect(container.querySelector(`[id="${clipId}"]`)).not.toBeNull();
  });

  it("gives other emblems no sheen", () => {
    const { container } = renderEmblem({
      subject: { kind: "badge", slug: "veteran" },
      state: { earned: true, earnedAt: "2026-03-03" },
    });
    expect(parts(container, "sheen")).toHaveLength(0);
  });

  it("hangs an award from a ribbon and names its label", () => {
    const { container } = renderEmblem({
      subject: { kind: "award", label: "Winner — RAG Hack 2026" },
      state: { earned: true, earnedAt: "2026-03-03" },
    });
    expect(
      screen.getByRole("img", {
        name: "Award: Winner — RAG Hack 2026, earned March 3, 2026",
      }),
    ).toHaveAttribute("data-shape", "medal");
    expect(parts(container, "ribbon")).toHaveLength(1);
  });

  it("is hidden from assistive technology when decorative", () => {
    const { container } = renderEmblem({
      subject: { kind: "badge", slug: "regular" },
      state: { earned: true, earnedAt: "2026-03-03" },
      decorative: true,
    });
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("names an earned badge without a known date by name alone", () => {
    renderEmblem({
      subject: { kind: "badge", slug: "regular" },
      state: { earned: true, earnedAt: null },
    });
    expect(
      screen.getByRole("img", { name: "Regular, tier II" }),
    ).toBeInTheDocument();
  });

  it.each(["sm", "md", "lg"] as EmblemSize[])(
    "renders every catalog badge as a valid %s SVG, one shape and glyph per track",
    (size) => {
      const seen = new Map<string, string>();
      for (const badge of BADGE_CATALOG) {
        const { container, unmount } = renderEmblem({
          subject: { kind: "badge", slug: badge.slug },
          state: { earned: true, earnedAt: "2026-03-03" },
          size,
        });
        const svg = container.querySelector("svg")!;
        const px = { sm: "24", md: "48", lg: "96" }[size];
        expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
        expect(svg.getAttribute("width")).toBe(px);
        expect(svg.getAttribute("aria-label")).toBeTruthy();
        expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
        const glyph = parts(svg, "glyph")[0]!.getAttribute("class")!;
        const key = `${svg.getAttribute("data-shape")}|${glyph}`;
        if (badge.kind === "track") {
          const owner = seen.get(key);
          expect(owner === undefined || owner === badge.track, key).toBe(true);
          seen.set(key, badge.track);
        }
        unmount();
      }
      const shapes = new Set([...seen.keys()].map((k) => k.split("|")[0]));
      expect(shapes.size).toBe(BADGE_TRACK_IDS.length);
      expect(seen.size).toBe(BADGE_TRACK_IDS.length);
    },
  );
});
