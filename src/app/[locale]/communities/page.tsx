import { resolveLocale } from "@/i18n/messages";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { api, HydrateClient } from "@/trpc/server";
import { CommunitiesDirectory } from "@/components/communities/communities-directory";
import {
  gridQueryInput,
  parseDirectoryParams,
  squareQueryInput,
} from "@/components/communities/discover/directory-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("communities.discover");
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    ...buildOgMeta(title, description, title),
    alternates: await localeAlternates("/communities"),
  };
}

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [raw, locale] = await Promise.all([searchParams, getLocale()]);
  const lang = resolveLocale(locale);
  const params = parseDirectoryParams({
    get: (key) => {
      const value = raw[key];
      return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
    },
  });

  // The square, the first page of the grid and the rooms arrive in the
  // HTML, so visitors, search engines and link previews see real
  // communities.
  await Promise.all([
    api.communities.directory.prefetch(squareQueryInput(lang)),
    api.communities.directory.prefetchInfinite(gridQueryInput(params, lang)),
    // The rooms decide the layout (side panel or not): no jump on load.
    api.spaces.squareRooms.prefetch(),
  ]);

  return (
    <HydrateClient>
      <CommunitiesDirectory />
    </HydrateClient>
  );
}
