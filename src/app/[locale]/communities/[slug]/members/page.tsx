import { CommunityMembersHub } from "@/components/communities/matching/members-hub";
import { matchingRedirectFromPeople } from "@/components/communities/matching/find-a-match-tab";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/messages";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { CommunityPeopleDirectory } from "@/components/communities/matching/community-people-directory";
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
  const search = await searchParams;
  // Matching moved to its own page; old `?tab=profile` links land there.
  const matchQuery = matchingRedirectFromPeople(searchParamsFromRecord(search));
  if (matchQuery) {
    redirect({
      href: `/communities/${slug}/match?${matchQuery.toString()}`,
      locale: resolveLocale(locale),
    });
  }
  if (isOpenCommunitiesEnabled()) {
    return <CommunityPeopleDirectory key={slug} slug={slug} search={search} />;
  }
  return <CommunityMembersHub key={slug} slug={slug} />;
}
