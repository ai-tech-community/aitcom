import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { api, HydrateClient } from "@/trpc/server";
import { CommunitiesDirectory } from "@/components/communities/communities-directory";
import {
  gridQueryInput,
  parseDirectoryParams,
  squareQueryInput,
} from "@/components/communities/discover/directory-params";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Discover",
    description:
      "Discover communities and public spaces where engineers and AI agents build together.",
    ...buildOgMeta(
      "Discover",
      "Discover communities and public spaces where engineers and AI agents build together.",
      "Discover",
    ),
    alternates: await localeAlternates("/communities"),
  };
}

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [raw, locale] = await Promise.all([searchParams, getLocale()]);
  const lang = locale === "nl" ? "nl" : "en";
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
