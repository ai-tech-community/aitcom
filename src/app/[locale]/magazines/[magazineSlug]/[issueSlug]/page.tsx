import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { IssueReader } from "@/components/magazines/reading/issue-reader";
import { resolveLocale, type AppLocale } from "@/i18n/messages";
import { isIssueIndexable } from "@/lib/magazines/indexing";
import { issuePath } from "@/lib/magazines/paths";
import {
  buildOgImageMeta,
  buildOgMeta,
  localeAlternates,
} from "@/lib/metadata";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { loadIssuePage } from "@/server/magazines/reading";
import { getPayloadClient } from "@/server/payload";

// Access is decided per request: a visibility change shows on the next
// request (ADR-0042), never from a cache.
export const dynamic = "force-dynamic";

type Params = Promise<{
  locale: string;
  magazineSlug: string;
  issueSlug: string;
}>;

/** One load per request, shared by the metadata and the page. */
const loadPage = cache(
  async (magazineSlug: string, issueSlug: string, locale: AppLocale) => {
    const [session, payload] = await Promise.all([
      getSession(),
      getPayloadClient(),
    ]);
    return loadIssuePage(
      { db, payload },
      {
        magazineSlug,
        issueSlug,
        viewerId: session?.user?.id ?? null,
        locale,
      },
    );
  },
);

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale: rawLocale, magazineSlug, issueSlug } = await params;
  const locale = resolveLocale(rawLocale);
  const data = await loadPage(magazineSlug, issueSlug, locale);
  if (!data) return {};

  const { magazine, community, issue } = data;
  const t = await getTranslations({ locale, namespace: "magazines.meta" });
  const title = `${issue.title} · ${magazine.name}`;
  const description =
    magazine.description ??
    t("issueDescription", {
      number: issue.number,
      magazine: magazine.name,
      community: community.name,
    });
  // Only an issue anyone may read is indexed: the effective value, so an
  // unconfirmed public issue in an unlisted community stays out (F10).
  const indexable = isIssueIndexable(issue, magazine);

  return {
    title,
    description,
    ...(issue.coverImageUrl
      ? buildOgImageMeta(title, description, issue.coverImageUrl)
      : buildOgMeta(issue.title, description, magazine.name)),
    alternates: await localeAlternates(issuePath(magazine, issue)),
    ...(indexable ? {} : { robots: { index: false } }),
  };
}

export default async function IssuePage({ params }: { params: Params }) {
  const { locale: rawLocale, magazineSlug, issueSlug } = await params;
  const locale = resolveLocale(rawLocale);
  const data = await loadPage(magazineSlug, issueSlug, locale);
  if (!data) notFound();
  return <IssueReader data={data} locale={locale} />;
}
