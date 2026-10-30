import type { ReactNode } from "react";
import { MagazineFonts } from "@/components/magazines/magazine-fonts";

export default function MagazineReadingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <MagazineFonts>{children}</MagazineFonts>;
}
