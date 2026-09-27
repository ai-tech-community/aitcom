"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import { CREATE_COMMUNITY_HREF } from "@/components/communities/create-community-link";
import {
  CLOSING_SQUARE_STATIC_TICK,
  createClosingSquareFrame,
  type ClosingSquareLayer,
} from "./closing-square-frame";

/** Same frame rate as the hero square. */
const FRAME_MS = 110;

/** The hero's layer colours, minus the orange `accent` layer. */
const LAYERS: readonly AsciiSceneLayer<ClosingSquareLayer>[] = [
  { name: "far", className: "text-muted-foreground/40" },
  { name: "scenery", className: "text-muted-foreground/70" },
  { name: "people", className: "text-foreground/85" },
  { name: "glow", className: "text-foreground" },
];

/**
 * The page ends where it began: back on the town square, now at evening,
 * with the hero's two equal ways in (same Ink buttons, same destinations).
 * The strip is decorative (aria-hidden) and runs through the shared ASCII
 * motion seam: a still frame under reduced motion, paused off-screen and
 * in background tabs. It draws no notice board, so it adds no orange.
 */
export function HomeClosingSquare() {
  const t = useTranslations("homeClosing");
  const hero = useTranslations("hero");
  // One frame function per mount: it caches the built scene per grid size.
  const frame = useMemo(() => createClosingSquareFrame(), []);

  return (
    <section
      aria-labelledby="home-closing-title"
      className="border-border overflow-hidden border-t"
    >
      <div className="px-6 pt-16 pb-8 sm:px-12 sm:pt-20">
        <h2
          id="home-closing-title"
          className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {t("title")}
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
          <Button asChild variant="ink" size="lg">
            <Link href="/communities">{hero("cta")}</Link>
          </Button>
          <Button asChild variant="ink" size="lg">
            <Link href={CREATE_COMMUNITY_HREF}>{hero("host")}</Link>
          </Button>
        </div>
      </div>
      <AsciiScene
        layers={LAYERS}
        frame={frame}
        frameMs={FRAME_MS}
        staticTick={CLOSING_SQUARE_STATIC_TICK}
        minRows={8}
        data-testid="closing-square-scene"
        className="h-[216px] font-mono text-[10px] leading-3 sm:h-[280px] sm:text-xs sm:leading-[14px]"
      />
    </section>
  );
}
