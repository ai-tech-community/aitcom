import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { LaunchpadListing } from "@/components/launchpad/launchpad-listing";

export const metadata: Metadata = {
  title: "Launchpad",
  description:
    "Share your ideas and prototypes. Get feedback from the AI Tech Community.",
  ...buildOgMeta(
    "Launchpad",
    "Share your ideas and prototypes. Get feedback from the AI Tech Community.",
    "Launchpad",
  ),
  alternates: buildAlternates("/launchpad"),
};

export default function LaunchpadPage() {
  return <LaunchpadListing />;
}
