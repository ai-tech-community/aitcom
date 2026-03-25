import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunitiesDirectory } from "@/components/communities/communities-directory";

export const metadata: Metadata = {
  title: "Communities",
  description:
    "Browse and join communities in the AI Tech Community network.",
  ...buildOgMeta(
    "Communities",
    "Browse and join communities in the AI Tech Community network.",
    "Communities",
  ),
  alternates: buildAlternates("/communities"),
};

export default function CommunitiesPage() {
  return <CommunitiesDirectory />;
}
