import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient } from "@/server/payload";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunityThreadDetail } from "@/components/forum/community-thread-detail";
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";

async function findThreadInCommunity(
  communitySlug: string,
  threadSlug: string,
) {
  const community = await db.query.communities.findFirst({
    where: and(
      eq(communities.slug, communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true },
  });
  if (!community) return null;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: {
      and: [
        { slug: { equals: threadSlug } },
        { communityId: { equals: community.id } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; threadSlug: string }>;
}): Promise<Metadata> {
  const { slug, threadSlug } = await params;
  const thread = await findThreadInCommunity(slug, threadSlug);
  if (!thread) return {};
  return {
    title: `${thread.title} — Forum — AIT`,
    description: `${thread.title} — AIT Community Forum`,
    ...buildOgMeta(thread.title, `${thread.title} — AIT Community Forum`),
    alternates: buildAlternates(`/communities/${slug}/forum/${threadSlug}`),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; threadSlug: string }>;
}) {
  const { slug, threadSlug } = await params;
  const thread = await findThreadInCommunity(slug, threadSlug);
  if (!thread) notFound();

  return <CommunityThreadDetail communitySlug={slug} threadSlug={threadSlug} />;
}
