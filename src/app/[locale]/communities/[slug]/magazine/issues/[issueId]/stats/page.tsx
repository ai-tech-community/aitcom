import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { IssueStatsView } from "@/components/magazines/editor/stats/issue-stats-view";
import { resolveLocale } from "@/i18n/messages";
import { parseIssueId } from "@/lib/magazines/parse-issue-id";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";
import { canEditIssueAt } from "@/server/magazines/issue-editing";
import { loadIssueStats } from "@/server/magazines/stats/issue-stats";
import { getPayloadClient } from "@/server/payload";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string; issueId: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "magazineEditor.stats",
  });
  return { title: t("label"), robots: { index: false } };
}

/** Guests sign in first; only editors of this issue may read its numbers. */
export default async function IssueStatsPage({ params }: { params: Params }) {
  const { locale, slug, issueId: rawIssueId } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}/communities/${slug}/magazine/issues/${rawIssueId}/stats`,
    );
  }
  const issueId = parseIssueId(rawIssueId);
  if (issueId === null) notFound();
  const deps = { db, payload: await getPayloadClient() };
  if (
    !(await canEditIssueAt(deps, {
      communitySlug: slug,
      issueId,
      viewerId: session.user.id,
    }))
  )
    notFound();

  const [stats, community] = await Promise.all([
    loadIssueStats(deps, issueId, resolveLocale(locale)),
    db.query.communities.findFirst({
      where: eq(communities.slug, slug),
      columns: { name: true },
    }),
  ]);
  if (!stats || !community) notFound();
  return (
    <IssueStatsView
      stats={stats}
      communitySlug={slug}
      communityName={community.name}
    />
  );
}
