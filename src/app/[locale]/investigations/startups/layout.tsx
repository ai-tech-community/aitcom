import type { ReactNode } from "react";
import type { Metadata } from "next";

/**
 * Staging default for Directory + Insights. Page `generateMetadata` still
 * lifts to index,follow at ≥3000 verified rows. This layout keeps
 * noindex,follow if that function is skipped.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function StartupsInvestigationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
