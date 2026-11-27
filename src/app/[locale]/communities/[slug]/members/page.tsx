import { CommunityMembersHub } from "@/components/communities/matching/members-hub";
import { matchingRedirectFromPeople } from "@/components/communities/matching/find-a-match-tab";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/messages";
import {
  searchParamsFromRecord,
  type SearchParamsRecord,
} from "@/lib/search-params-record";

export default async function CommunityMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const { locale, slug } = await params;
  // Matching moved to its own page; old `?tab=profile` links land there.
  const matchQuery = matchingRedirectFromPeople(
    searchParamsFromRecord(await searchParams),
  );
  if (matchQuery) {
    redirect({
      href: `/communities/${slug}/match?${matchQuery.toString()}`,
      locale: resolveLocale(locale),
    });
  }
  return <CommunityMembersHub key={slug} slug={slug} />;
}
