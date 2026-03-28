import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPayloadClient } from "@/server/payload";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { ThreadDetail } from "@/components/forum/thread-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  const thread = docs[0];
  if (!thread) return {};
  return {
    title: `${thread.title} — Forum — AIT`,
    description: `${thread.title} — AIT Community Forum`,
    ...buildOgMeta(thread.title, `${thread.title} — AIT Community Forum`),
    alternates: buildAlternates(`/forum/${slug}`),
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Verify the thread exists server-side so we can 404 early
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  if (docs.length === 0) notFound();

  return <ThreadDetail slug={slug} />;
}
