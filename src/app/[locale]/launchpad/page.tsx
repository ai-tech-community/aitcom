import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { LaunchpadListing } from "@/components/launchpad/launchpad-listing";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Launchpad",
    description:
      "Share your ideas and prototypes. Get feedback from the AI Tech Community.",
    ...buildOgMeta(
      "Launchpad",
      "Share your ideas and prototypes. Get feedback from the AI Tech Community.",
      "Launchpad",
    ),
    alternates: await localeAlternates("/launchpad"),
  };
}

export default function LaunchpadPage() {
  return <LaunchpadListing />;
}
