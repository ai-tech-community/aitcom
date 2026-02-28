import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { memberProfiles, memberBadges } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { isTrustedAuthor } from "@/lib/gamification";
import { ArticleEditor } from "@/components/article-editor";

export default async function WriteArticlePage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

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
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12">
      <ArticleEditor isTrustedAuthor={trusted} />
    </div>
  );
}
