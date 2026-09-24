import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient } from "@/server/payload";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { CommunityThreadDetail } from "@/components/forum/community-thread-detail";
import { forumThreadMatchesCommunity } from "@/server/communities/forum-scope";
import { findReadableCommunityBySlug } from "@/server/communities/content-visibility-queries";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";

async function findThreadInCommunity(
  communitySlug: string,
  threadSlug: string,
) {
  // Unlisted communities are members-only; answer as if the thread is absent.
  const session = await getSession();
  const community = await findReadableCommunityBySlug(
    db,
    communitySlug,
    session?.user?.id,
  );
  if (!community) return null;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: threadSlug } },
    limit: 1,
    depth: 0,
  });
  const thread = docs[0];
  if (
    !thread ||
    !forumThreadMatchesCommunity(thread.communityId, {
      id: community.id,
      slug: communitySlug,
    })
  ) {
    return null;
  }
  return thread;
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
    alternates: await localeAlternates(
      `/communities/${slug}/forum/${threadSlug}`,
    ),
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
