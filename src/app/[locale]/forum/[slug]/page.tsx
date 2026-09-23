import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient } from "@/server/payload";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { ThreadDetail } from "@/components/forum/thread-detail";
import { viewerCanReadContentOf } from "@/server/communities/content-visibility-queries";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";

/** The thread, or null when it is missing or its community is unreadable. */
async function findReadableThread(slug: string) {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  const thread = docs[0];
  if (!thread) return null;
  const session = await getSession();
  const readable = await viewerCanReadContentOf(
    db,
    thread.communityId,
    session?.user?.id,
  );
  return readable ? thread : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const thread = await findReadableThread(slug);
  if (!thread) return {};
  return {
    title: `${thread.title} — Forum — AIT`,
    description: `${thread.title} — AIT Community Forum`,
    ...buildOgMeta(thread.title, `${thread.title} — AIT Community Forum`),
    alternates: await localeAlternates(`/forum/${slug}`),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Verify the thread exists and is readable server-side so we can 404 early
  if (!(await findReadableThread(slug))) notFound();

  return <ThreadDetail slug={slug} />;
}
