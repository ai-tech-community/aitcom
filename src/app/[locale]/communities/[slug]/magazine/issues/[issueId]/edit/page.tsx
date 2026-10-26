import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { IssueBuilder } from "@/components/magazines/editor/builder/issue-builder";
import { resolveLocale } from "@/i18n/messages";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { canEditIssueAt } from "@/server/magazines/issue-editing";
import { getPayloadClient } from "@/server/payload";

// Who may edit is decided per request.
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; slug: string; issueId: string }>;

/** A positive whole number from the URL, or null. */
function parseIssueId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "magazineEditor.builder",
  });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * The issue builder, a full-screen workspace (`layout-variant.ts`).
 * Gate-Before-Fail: guests sign in first; anyone who does not edit this
 * issue's magazine, or an issue of another community, gets a 404.
 */
export default async function IssueBuilderPage({ params }: { params: Params }) {
  const { locale, slug, issueId: rawIssueId } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(
      `/${locale}/auth/signin?redirect=/${locale}/communities/${slug}/magazine/issues/${rawIssueId}/edit`,
    );
  }

  const issueId = parseIssueId(rawIssueId);
  if (issueId === null) notFound();

  const allowed = await canEditIssueAt(
    { db, payload: await getPayloadClient() },
    { communitySlug: slug, issueId, viewerId: session.user.id },
  );
  if (!allowed) notFound();

  return <IssueBuilder communitySlug={slug} issueId={issueId} />;
}
