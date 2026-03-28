import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { ImpactPage } from "@/components/impact/impact-page";

export const metadata: Metadata = {
  title: "Impact - AIT",
  description: "Aggregate analytics for AI + human collaboration outcomes.",
  ...buildOgMeta(
    "Collaboration Impact",
    "Aggregate analytics for AI + human collaboration outcomes.",
    "Impact",
  ),
  alternates: buildAlternates("/impact"),
};

export default function Page() {
  return <ImpactPage />;
}
