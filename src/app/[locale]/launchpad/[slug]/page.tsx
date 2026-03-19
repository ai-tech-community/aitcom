import type { Metadata } from "next";
import { getPayloadClient } from "@/server/payload";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { LaunchpadDetail } from "@/components/launchpad/launchpad-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "launchpad-projects",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });

  const project = docs[0];
  if (!project) {
    return { title: "Project Not Found" };
  }

  return {
    title: `${project.title} - Launchpad`,
    description: `${project.title} — a ${project.stage} stage project on AIT Community Launchpad`,
    ...buildOgMeta(
      project.title,
      `${project.title} — a ${project.stage} stage project on AIT Community Launchpad`,
      "Launchpad",
    ),
    alternates: buildAlternates(`/launchpad/${slug}`),
  };
}

export default async function LaunchpadProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LaunchpadDetail slug={slug} />;
}
