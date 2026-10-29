import {
  DM_Sans,
  Fraunces,
  Libre_Baskerville,
  Newsreader,
  Outfit,
  Source_Sans_3,
  Source_Serif_4,
} from "next/font/google";
import type { ReactNode } from "react";

import {
  resolveMagazineTheme,
  type MagazineFontPairId,
} from "@/lib/magazines/theme";
import { cn } from "@/lib/utils";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-magazine-serif-face",
});

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-magazine-serif-face",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-magazine-serif-face",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-magazine-serif-face",
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-magazine-sans-face",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-magazine-sans-face",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-magazine-sans-face",
});

const FACE: Record<MagazineFontPairId, string> = {
  journal: newsreader.variable,
  broadsheet: cn(baskerville.variable, sourceSans.variable),
  fashion: cn(fraunces.variable, outfit.variable),
  literary: cn(sourceSerif.variable, dmSans.variable),
};

/** Loads the magazine's type pair and sets its accent inks. */
export function MagazineFontScope({
  fontPair,
  accent,
  children,
}: {
  fontPair?: string | null;
  accent?: string | null;
  children: ReactNode;
}) {
  const theme = resolveMagazineTheme({ fontPair, accent });
  return (
    <div
      className={cn("magazine-theme overflow-x-clip", FACE[theme.fontPair])}
      style={{
        ["--magazine-accent" as string]: theme.accent,
        ["--magazine-accent-on-light" as string]: theme.inkOnLight,
        ["--magazine-accent-on-dark" as string]: theme.inkOnDark,
      }}
    >
      {children}
    </div>
  );
}
