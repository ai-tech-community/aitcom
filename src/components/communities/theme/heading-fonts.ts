import {
  DM_Serif_Display,
  Fraunces,
  Nunito,
  Space_Grotesk,
} from "next/font/google";

import type { CommunityHeadingFontId } from "@/lib/communities/themes";

/*
 * The heading faces of the community looks. Each one sets the same variable,
 * `--community-heading-face`, which `font-community-heading` reads (with
 * Geist Sans behind it). `preload: false`: a face is downloaded only on a
 * page whose look puts its class on the frame, so a community page fetches
 * at most one of the four. `latin-ext` covers letters beyond basic Latin
 * in community names (Dutch ĳ, Polish ł, Turkish ş); its `unicode-range`
 * file is fetched only when such a letter shows. next/font keeps
 * its size-adjusted fallback on, so the swap does not shift the layout.
 */

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

type HeadingFace = {
  /** The class that sets `--community-heading-face`. */
  variable: string;
  /**
   * The face ships in one weight. Headings ask for semibold, and the
   * browser would smear a fake bold over it, so the frame turns that off.
   */
  singleWeight: boolean;
};

const HEADING_FACES: Record<CommunityHeadingFontId, HeadingFace> = {
  fraunces: { variable: fraunces.variable, singleWeight: false },
  nunito: { variable: nunito.variable, singleWeight: false },
  "dm-serif-display": { variable: dmSerifDisplay.variable, singleWeight: true },
  "space-grotesk": { variable: spaceGrotesk.variable, singleWeight: false },
};

/** The class that loads a look's heading face; none for the house face. */
export function headingFontClass(id: CommunityHeadingFontId | null): string {
  return id ? HEADING_FACES[id].variable : "";
}

/**
 * The custom properties a heading face needs on the frame:
 * `--community-heading-synthesis: none` for a one-weight face, which the
 * `font-community-heading` utility reads (globals.css).
 */
export function headingFontProperties(
  id: CommunityHeadingFontId | null,
): Record<string, string> {
  return id && HEADING_FACES[id].singleWeight
    ? { "--community-heading-synthesis": "none" }
    : {};
}
