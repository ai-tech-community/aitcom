import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { api, HydrateClient } from "@/trpc/server";
import { loadHubAuthSeed } from "@/server/better-auth/hub-session-server";
import { memberRoleForSlug } from "@/server/better-auth/hub-session";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { CommunityOverviewPageClient } from "./_overview-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("communities");
  try {
    const c = await api.communities.getBySlug({ slug });
    const title = t("detailTitle", { name: c.name });
    const description =
      c.description ?? t("detailDescription", { name: c.name });
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: c.logoUrl ? [{ url: c.logoUrl }] : undefined,
        type: "website",
      },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: t("detailMissing") };
  }
}

export default async function CommunityOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { initialUser, initialMemberships } = await loadHubAuthSeed();
  const page = (
    <CommunityOverviewPageClient
      params={params}
      initialUser={initialUser}
      initialMemberships={initialMemberships}
    />
  );
  if (!isOpenCommunitiesEnabled() || !initialUser) return page;

  const { slug } = await params;
  if (!memberRoleForSlug(initialMemberships, slug)) return page;

  // Reserve the first paint for the real chips and first page of posts.
  await Promise.all([
    api.topics.list.prefetch({ communitySlug: slug }),
    api.feed.getActivity.prefetchInfinite({ communitySlug: slug }),
  ]);
  return <HydrateClient>{page}</HydrateClient>;
}
