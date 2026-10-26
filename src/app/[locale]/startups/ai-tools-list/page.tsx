import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { AiToolsListHub } from "@/components/investigations/ai-tools-list-hub";
import {
  aiToolsHubPagePath,
  aiToolsListCopy,
} from "@/lib/investigations/ai-tools-list";
import { paginateStartupCards } from "@/lib/investigations/startups";
import {
  absoluteLocaleUrl,
  buildOgMeta,
  localeAlternates,
} from "@/lib/metadata";
import { listAiToolsHubStartups } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

function parseHubPage(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  return Number(value);
}

export async function generateMetadata(
  { searchParams }: PageProps = {
    searchParams: Promise.resolve({}),
  },
): Promise<Metadata> {
  const locale = await getLocale();
  const raw = await searchParams;
  const copy = aiToolsListCopy(locale);
  const cards = await listAiToolsHubStartups();
  const pagination = paginateStartupCards(cards, parseHubPage(raw.page));
  const canonicalPath = aiToolsHubPagePath(pagination.page);
  const paginationLinks =
    pagination.totalPages > 1
      ? {
          pagination: {
            ...(pagination.page > 1
              ? {
                  previous: absoluteLocaleUrl(
                    locale,
                    aiToolsHubPagePath(pagination.page - 1),
                  ),
                }
              : {}),
            ...(pagination.page < pagination.totalPages
              ? {
                  next: absoluteLocaleUrl(
                    locale,
                    aiToolsHubPagePath(pagination.page + 1),
                  ),
                }
              : {}),
          },
        }
      : {};

  return {
    title: copy.title,
    description: copy.description,
    robots: { index: true, follow: true },
    ...buildOgMeta(copy.title, copy.description, "Startups"),
    alternates: await localeAlternates(canonicalPath),
    ...paginationLinks,
  };
}

export default async function AiToolsListPage({ searchParams }: PageProps) {
  const locale = await getLocale();
  const raw = await searchParams;
  const cards = await listAiToolsHubStartups();
  // Directory page size (24). Later pages stay crawlable; this page's
  // ItemList is only the names rendered here.
  const pagination = paginateStartupCards(cards, parseHubPage(raw.page));
  return (
    <AiToolsListHub
      locale={locale}
      cards={pagination.items}
      page={pagination.page}
      totalPages={pagination.totalPages}
    />
  );
}
