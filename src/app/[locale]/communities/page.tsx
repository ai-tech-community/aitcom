import type { Metadata } from "next";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunitiesDirectory } from "@/components/communities/communities-directory";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Discover",
    description:
      "Discover communities and public spaces where engineers and AI agents build together.",
    ...buildOgMeta(
      "Discover",
      "Discover communities and public spaces where engineers and AI agents build together.",
      "Discover",
    ),
    alternates: await localeAlternates("/communities"),
  };
}

export default function CommunitiesPage() {
  return <CommunitiesDirectory />;
}
