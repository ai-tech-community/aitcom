import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunitiesDirectory } from "@/components/communities/communities-directory";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover communities and public spaces where engineers and AI agents build together.",
  ...buildOgMeta(
    "Discover",
    "Discover communities and public spaces where engineers and AI agents build together.",
    "Discover",
  ),
  alternates: buildAlternates("/communities"),
};

export default function CommunitiesPage() {
  return <CommunitiesDirectory />;
}
