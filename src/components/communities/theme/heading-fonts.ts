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
 * at most one of the four. next/font keeps its size-adjusted fallback on, so
 * the swap does not shift the layout.
 */

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

// Ships in one weight only.
const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--community-heading-face",
});

const HEADING_FACE: Record<CommunityHeadingFontId, string> = {
  fraunces: fraunces.variable,
  nunito: nunito.variable,
  "dm-serif-display": dmSerifDisplay.variable,
  "space-grotesk": spaceGrotesk.variable,
};

/** The class that loads a look's heading face; none for the house face. */
export function headingFontClass(id: CommunityHeadingFontId | null): string {
  return id ? HEADING_FACE[id] : "";
}
