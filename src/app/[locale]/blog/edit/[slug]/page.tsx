import { redirect, notFound } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedAuthor } from "@/lib/gamification";
import { getPayloadClient } from "@/server/payload";
import { ArticleEditor } from "@/components/article-editor";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    draft: true,
  });

  const article = docs[0];
  if (!article) return notFound();
  if (article.authorId !== session.user.id) return notFound();

  const profile = await db.query.memberProfiles.findFirst({
    where: eq(memberProfiles.userId, session.user.id),
  });
  if (!profile) redirect("/");

  const badges = await db
    .select()
    .from(memberBadges)
    .where(eq(memberBadges.userId, session.user.id));

  const trusted = isTrustedAuthor(profile.xp, badges);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:px-12">
        <ArticleEditor
          initialData={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          content: article.content,
          type: article.type as "article" | "tutorial",
          tags: (article.tags as { tag: string }[]) ?? [],
          mediaUrl: article.mediaUrl ?? undefined,
          reviewStatus: article.reviewStatus ?? undefined,
          reviewNote: article.reviewNote ?? undefined,
        }}
        isTrustedAuthor={trusted}
      />
    </div>
  );
}
