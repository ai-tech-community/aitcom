import type { Metadata } from "next";

import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { HubIdeas } from "@/components/ideas/hub-ideas";

export const metadata: Metadata = {
  title: "Ideas",
  description:
    "Suggest and vote on improvements to the AIT Community platform.",
  ...buildOgMeta(
    "Ideas",
    "Suggest and vote on improvements to the AIT Community platform.",
    "Ideas",
  ),
  alternates: buildAlternates("/ideas"),
};

export default async function HubIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; new?: string }>;
}) {
  const params = await searchParams;
  const initialCategory =
    params.category === "agent-capability" || params.category === "platform"
      ? params.category
      : undefined;

  return (
    <HubIdeas
      initialCategory={initialCategory}
      initialShowForm={params.new === "1"}
    />
  );
}
