import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getPayloadClient } from "@/server/payload";
import type { Metadata } from "next";

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
  return { title: docs[0]?.title ?? "Thread" };
}

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await getPayloadClient();

  const { docs: threadDocs } = await payload.find({
    collection: "forum-threads",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });

  const thread = threadDocs[0];
  if (!thread) notFound();

  const { docs: replies } = await payload.find({
    collection: "forum-replies",
    where: { thread: { equals: thread.id } },
    sort: "createdAt",
    limit: 200,
    depth: 0,
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
      {/* Back link */}
      <Link
        href="/community"
        className="font-mono text-xs tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
      >
        &larr; Community Board
      </Link>

      {/* Thread header */}
      <div className="mt-6">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
          <span>{thread.category}</span>
          <span>&middot;</span>
          <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
          {thread.authorName && (
            <>
              <span>&middot;</span>
              <span>{thread.authorName}</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-900">
          {thread.title}
        </h1>
      </div>

      {/* Thread content */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
          {thread.content}
        </p>
      </div>

      {/* Replies */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </h2>
        <div className="space-y-3">
          {replies.map((reply) => (
            <div
              key={reply.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
            >
              <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-wider text-zinc-400">
                <span>{reply.authorName ?? "member"}</span>
                <span>&middot;</span>
                <span>
                  {new Date(reply.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
