import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getPayloadClient } from "@/server/payload";
import type { Metadata } from "next";
import type { ForumThread, ForumReply, User } from "@/payload-types";

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
  return { title: (docs[0] as ForumThread | undefined)?.title ?? "Thread" };
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
    depth: 1,
  });

  const thread = threadDocs[0] as ForumThread | undefined;
  if (!thread) notFound();

  const { docs: replyDocs } = await payload.find({
    collection: "forum-replies",
    where: { thread: { equals: thread.id } },
    sort: "createdAt",
    limit: 200,
    depth: 1,
  });

  const replies = replyDocs as ForumReply[];
  const authorUser =
    typeof thread.author === "object" ? (thread.author as User) : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-12">
      {/* Back link */}
      <Link
        href="/community"
        className="font-mono text-xs tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
      >
        &larr; Community Board
      </Link>

      {/* Thread header */}
      <div className="mt-6">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          <span>{thread.category}</span>
          <span>&middot;</span>
          <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
          {authorUser?.name && (
            <>
              <span>&middot;</span>
              <span>{authorUser.name}</span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-100">
          {thread.title}
        </h1>
      </div>

      {/* Thread content */}
      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {thread.content}
        </p>
      </div>

      {/* Replies */}
      <div className="mt-8">
        <h2 className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {replies.length} {replies.length === 1 ? "Reply" : "Replies"}
        </h2>
        <div className="space-y-3">
          {replies.map((reply) => {
            const replyAuthor =
              typeof reply.author === "object"
                ? (reply.author as User)
                : null;
            return (
              <div
                key={reply.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="mb-2 flex items-center gap-2 font-mono text-[9px] tracking-wider text-zinc-600">
                  <span>{replyAuthor?.name ?? "member"}</span>
                  <span>&middot;</span>
                  <span>
                    {new Date(reply.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {reply.content}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
