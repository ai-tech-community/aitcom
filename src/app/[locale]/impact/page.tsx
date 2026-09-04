import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { ImpactPage } from "@/components/impact/impact-page";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Impact - AIT",
    description: "Aggregate analytics for AI + human collaboration outcomes.",
    ...buildOgMeta(
      "Collaboration Impact",
      "Aggregate analytics for AI + human collaboration outcomes.",
      "Impact",
    ),
    alternates: await localeAlternates("/impact"),
  };
}

export default function Page() {
  return <ImpactPage />;
}
