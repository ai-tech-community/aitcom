import { loadHubAuthSeed } from "@/server/better-auth/hub-session-server";
import { api, HydrateClient } from "@/trpc/server";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";

import { CommunityLayoutClient } from "./_community-layout-client";

export const dynamic = "force-dynamic";

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = await params;
  // The frame's first paint must already hold the community, so it never
  // opens on a spinner. Awaited, not fired and forgotten: HydrateClient
  // sends the query cache as it is when it renders, and a prefetch still
  // running then reaches the client as pending. A missing community fails
  // here quietly (prefetch never throws) and is not sent; the client then
  // fetches it and takes the notFound() path itself. A global
  // `queries.retry` in createQueryClient would retry that NOT_FOUND here
  // and hold the 404 back on the server.
  const redesigned = isOpenCommunitiesEnabled();
  const authSeed = loadHubAuthSeed();
  const [{ initialUser, initialMemberships }] = await Promise.all([
    authSeed,
    api.communities.getBySlug.prefetch({ slug }),
    redesigned ? api.spaces.list.prefetch({ slug }) : undefined,
    redesigned
      ? authSeed.then(({ initialUser }) =>
          initialUser ? api.spaces.listRooms.prefetch({ slug }) : undefined,
        )
      : undefined,
  ]);
  return (
    <HydrateClient>
      <CommunityLayoutClient
        params={params}
        initialUser={initialUser}
        initialMemberships={initialMemberships}
      >
        {children}
      </CommunityLayoutClient>
    </HydrateClient>
  );
}
