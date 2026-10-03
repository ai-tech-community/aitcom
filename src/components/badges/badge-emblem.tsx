import type { CSSProperties, ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Compass,
  Feather,
  Flag,
  Flame,
  Gauge,
  GraduationCap,
  Handshake,
  IdCard,
  Megaphone,
  Presentation,
  Rocket,
  Sparkles,
  Ticket,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import {
  catalogBadge,
  type BadgeGlyph,
  type BadgeSlug,
  type CatalogBadge,
} from "@/lib/badges/catalog";
import {
  AWARD_EMBLEM,
  EMBLEM_SHAPES,
  LIMITED_EDITION_EMBLEM,
  MILESTONE_EMBLEM,
  TRACK_EMBLEMS,
  type EmblemShape,
  type EmblemStyle,
} from "@/lib/badges/emblem-shapes";
import type { EmblemPalette } from "@/lib/badges/emblem-palette";
import { tierFraction } from "@/lib/badges/progress";
import { cn } from "@/lib/utils";

import { EmblemSheen } from "./emblem-sheen";

export { SHEEN_CLASS } from "./emblem-sheen";

/** The glyph drawn inside each emblem: one line-icon family, one stroke. */
const GLYPHS: Record<BadgeGlyph | "award", LucideIcon> = {
  ticket: Ticket,
  megaphone: Megaphone,
  flag: Flag,
  quill: Feather,
  rocket: Rocket,
  mortarboard: GraduationCap,
  lectern: Presentation,
  handshake: Handshake,
  robot: Bot,
  gauge: Gauge,
  flame: Flame,
  "id-card": IdCard,
  compass: Compass,
  book: BookOpen,
  sparkle: Sparkles,
  award: Trophy,
};

export const EMBLEM_SIZES = { sm: 24, md: 48, lg: 96 } as const;
export type EmblemSize = keyof typeof EMBLEM_SIZES;

/**
 * Stroke weights in screen pixels per size, so each size is drawn crisp
 * rather than scaled: small emblems get relatively heavier lines and lose
 * the band pattern, which would only blur at 24px.
 */
const WEIGHTS: Record<
  EmblemSize,
  {
    hair: number;
    gap: number;
    band: number;
    glyph: number;
    arc: number;
    pattern: boolean;
  }
> = {
  sm: { hair: 1, gap: 2, band: 2.5, glyph: 1.5, arc: 1.5, pattern: false },
  md: { hair: 1, gap: 3, band: 4, glyph: 1.75, arc: 2, pattern: true },
  lg: { hair: 1.25, gap: 5, band: 7, glyph: 2.25, arc: 2.5, pattern: true },
};

/** What the emblem stands for: a catalog badge or a challenge award. */
export type EmblemSubject =
  | { kind: "badge"; slug: BadgeSlug }
  | { kind: "award"; label: string };

/**
 * Earned, or locked (owner only) with the progress towards it when the
 * badge has a metric.
 */
export type EmblemState =
  | {
      earned: true;
      /** Null where the date is not known (the roster): named without it. */
      earnedAt: Date | string | null;
    }
  | {
      earned: false;
      progress?: { current: number; threshold: number };
    };

export interface BadgeEmblemProps {
  subject: EmblemSubject;
  state: EmblemState;
  size?: EmblemSize;
  /**
   * The accessible name, from `useEmblemLabel()` ("Writer, tier II, earned
   * March 3, 2026"). Leave it out only when text right next to the emblem
   * already says all of it: the emblem is then hidden from assistive
   * technology.
   */
  label?: string;
  /**
   * Literal colours, for renderers without CSS custom properties (the Open
   * Graph image, via `emblemPalette`). The emblem then references no token
   * and draws no hover sheen. Leave it out in the browser.
   */
  palette?: EmblemPalette;
  className?: string;
}

type Variant =
  | { kind: "tier"; tier: 1 | 2 | 3 }
  | { kind: "milestone" }
  | { kind: "limited" }
  | { kind: "award" };

function styleOf(subject: EmblemSubject, badge: CatalogBadge | null) {
  if (subject.kind === "award") {
    return {
      style: AWARD_EMBLEM,
      glyph: "award" as const,
      variant: { kind: "award" } as Variant,
    };
  }
  if (badge?.kind === "track") {
    return {
      style: TRACK_EMBLEMS[badge.track],
      glyph: badge.glyph,
      variant: { kind: "tier", tier: badge.tier } as Variant,
    };
  }
  if (badge?.kind === "limitedEdition") {
    return {
      style: LIMITED_EDITION_EMBLEM,
      glyph: badge.glyph,
      variant: { kind: "limited" } as Variant,
    };
  }
  return {
    style: MILESTONE_EMBLEM,
    glyph: badge?.glyph ?? ("sparkle" as const),
    variant: { kind: "milestone" } as Variant,
  };
}

/** The silhouette and hue an emblem is drawn with. */
export function emblemStyleOf(subject: EmblemSubject): EmblemStyle {
  const badge = subject.kind === "badge" ? catalogBadge(subject.slug) : null;
  return styleOf(subject, badge).style;
}

/**
 * The emblem's silhouette and its theme-aware colours (`--emblem-ink`,
 * `--emblem-tint` as custom properties), for a decoration drawn around an
 * emblem in the same ink, like the earning moment's ring.
 */
export function emblemOutline(subject: EmblemSubject): {
  shape: EmblemShape;
  colours: CSSProperties;
} {
  const style = emblemStyleOf(subject);
  return { shape: EMBLEM_SHAPES[style.shape], colours: colourVars(style) };
}

/** Theme-aware colours as custom properties on the emblem's root. */
function colourVars(style: EmblemStyle): CSSProperties {
  const hue = style.hue ? `var(${style.hue})` : "0";
  const chroma = (token: string) => (style.hue ? `var(${token})` : "0");
  return {
    "--emblem-ink": `oklch(var(--emblem-ink-l) ${chroma("--emblem-ink-c")} ${hue})`,
    "--emblem-tint": `oklch(var(--emblem-tint-l) ${chroma("--emblem-tint-c")} ${hue})`,
  } as CSSProperties;
}

/** A transform that scales the silhouette about its centre. */
function scaleAbout(shape: EmblemShape, s: number): string {
  return `translate(${shape.cx} ${shape.cy}) scale(${s}) translate(${-shape.cx} ${-shape.cy})`;
}

/**
 * A badge emblem drawn in code (ADR-0039): the track's silhouette and
 * glyph, a ring that grows richer with each tier (I hairline, II double,
 * III a solid band with a fine pattern), in the track's quiet hue on a
 * neutral tint. Limited editions catch a sheen on hover (static under
 * reduced motion); awards hang from a ribbon. Locked badges (owner only)
 * are an outline with the progress traced along it.
 *
 * Purely presentational and server-renderable: the caller says what is
 * earned or locked, and passes the accessible name (`useEmblemLabel`).
 * Only the limited-edition sheen is a client child (it needs `useId`).
 */
export function BadgeEmblem({
  subject,
  state,
  size = "md",
  label,
  palette,
  className,
}: BadgeEmblemProps) {
  const ink = palette?.ink ?? "var(--emblem-ink)";
  const tint = palette?.tint ?? "var(--emblem-tint)";
  const badge = subject.kind === "badge" ? catalogBadge(subject.slug) : null;
  const { style, glyph, variant } = styleOf(subject, badge);
  const shape = EMBLEM_SHAPES[style.shape];
  const px = EMBLEM_SIZES[size];
  const w = WEIGHTS[size];
  /** User units (of the 100-unit box) per screen pixel. */
  const unit = 100 / px;
  const inset = (pxIn: number) => 1 - (pxIn * unit) / shape.r;

  const Glyph = GLYPHS[glyph];
  const glyphBox = shape.glyph.size;
  const glyphStroke = (w.glyph * 24 * unit) / glyphBox;
  const glyphNode = (
    <Glyph
      x={shape.glyph.cx - glyphBox / 2}
      y={shape.glyph.cy - glyphBox / 2}
      width={glyphBox}
      height={glyphBox}
      strokeWidth={glyphStroke}
      aria-hidden
      focusable={false}
      data-emblem-part="glyph"
      style={{ color: state.earned ? ink : undefined }}
      className={cn(!state.earned && "text-muted-foreground")}
    />
  );

  const a11y =
    label === undefined
      ? { "aria-hidden": true as const }
      : { role: "img" as const, "aria-label": label };

  if (!state.earned) {
    const fraction = state.progress
      ? tierFraction(state.progress.current, state.progress.threshold)
      : 0;
    return (
      <svg
        viewBox="0 0 100 100"
        width={px}
        height={px}
        {...a11y}
        data-state="locked"
        data-shape={shape.id}
        className={cn("shrink-0 overflow-visible", className)}
      >
        <path
          d={shape.d}
          fill="none"
          strokeLinejoin="round"
          strokeWidth={w.hair * unit}
          className="stroke-muted-foreground"
        />
        {fraction > 0 && (
          <path
            d={shape.d}
            fill="none"
            pathLength={100}
            strokeDasharray={`${round(fraction * 100)} 100`}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={w.arc * unit}
            data-emblem-part="progress"
            className="stroke-foreground"
          />
        )}
        {glyphNode}
      </svg>
    );
  }

  const ring = (scale: number, width: number, key?: string) => (
    <g key={key} transform={scaleAbout(shape, scale)}>
      <path
        d={shape.d}
        fill="none"
        strokeLinejoin="round"
        strokeWidth={(width * unit) / scale}
        style={{ stroke: ink }}
        data-emblem-part="ring"
      />
    </g>
  );

  let rings: ReactNode;
  if (variant.kind === "tier" && variant.tier === 3) {
    const bandScale = inset(w.band);
    const midScale = (1 + bandScale) / 2;
    rings = (
      <>
        <path d={shape.d} style={{ fill: ink }} data-emblem-part="band" />
        <g transform={scaleAbout(shape, bandScale)}>
          <path d={shape.d} style={{ fill: tint }} />
        </g>
        {w.pattern && (
          <g transform={scaleAbout(shape, midScale)}>
            <path
              d={shape.d}
              fill="none"
              strokeLinecap="round"
              strokeWidth={unit / midScale}
              strokeDasharray={`0 ${(2.5 * unit) / midScale}`}
              style={{ stroke: tint }}
              data-emblem-part="pattern"
            />
          </g>
        )}
      </>
    );
  } else if (
    (variant.kind === "tier" && variant.tier === 2) ||
    variant.kind === "limited"
  ) {
    rings = [
      ring(1, w.hair, "outer"),
      ring(inset(w.gap + w.hair), w.hair, "inner"),
    ];
  } else {
    rings = ring(1, w.hair);
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={px}
      height={px}
      {...a11y}
      data-state="earned"
      data-shape={shape.id}
      data-tier={variant.kind === "tier" ? variant.tier : undefined}
      style={palette ? undefined : colourVars(style)}
      className={cn("group/emblem shrink-0 overflow-visible", className)}
    >
      {variant.kind === "award" && (
        <g data-emblem-part="ribbon">
          <path d="M22 4 H40 L56 34 H38 Z" style={{ fill: ink }} />
          <path
            d="M60 4 H78 L62 34 H44 Z"
            style={{ fill: ink }}
            opacity={0.72}
          />
        </g>
      )}
      <path d={shape.d} style={{ fill: tint }} data-emblem-part="body" />
      {rings}
      {variant.kind === "limited" && !palette && <EmblemSheen d={shape.d} />}
      {glyphNode}
    </svg>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
