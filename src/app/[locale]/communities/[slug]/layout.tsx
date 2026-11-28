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
  const [{ initialUser, initialMemberships }] = await Promise.all([
    loadHubAuthSeed(),
    api.communities.getBySlug.prefetch({ slug }),
  ]);
  if (isOpenCommunitiesEnabled()) {
    // These procedures apply the same visibility rules as the sidebar's
    // client queries. Rejected prefetches never hydrate inaccessible rows.
    await Promise.all([
      api.spaces.list.prefetch({ slug }),
      initialUser ? api.spaces.listRooms.prefetch({ slug }) : undefined,
    ]);
  }
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
