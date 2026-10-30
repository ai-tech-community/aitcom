import { Bodoni_Moda, Cormorant_Garamond, Italiana } from "next/font/google";
import type { ReactNode } from "react";
import "@/styles/magazine.css";

const italiana = Italiana({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-magazine-italiana",
  display: "swap",
  preload: false,
});
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-magazine-bodoni",
  display: "swap",
  preload: false,
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-magazine-cormorant",
  display: "swap",
  preload: false,
});

/** next/font self-hosts the catalog; no Google requests from a reader's browser. */
export function MagazineFonts({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${italiana.variable} ${bodoni.variable} ${cormorant.variable}`}
    >
      {children}
    </div>
  );
}
