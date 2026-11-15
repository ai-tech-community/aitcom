import type { Metadata } from "next";
import { getPayloadClient } from "@/server/payload";
import { db } from "@/server/db";
import { getSession } from "@/server/better-auth/server";
import { viewerCanReadContentOf } from "@/server/communities/content-visibility-queries";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
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
  // A members-only community's project is not named to outsiders, not
  // even in the page title (ADR-0050).
  if (
    !project ||
    !(await viewerCanReadContentOf(
      db,
      project.communityId,
      (await getSession())?.user?.id,
    ))
  ) {
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
    alternates: await localeAlternates(`/launchpad/${slug}`),
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
