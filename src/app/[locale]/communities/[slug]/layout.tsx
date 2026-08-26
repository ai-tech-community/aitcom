import { loadHubAuthSeed } from "@/server/better-auth/hub-session-server";

import { CommunityLayoutClient } from "./_community-layout-client";

export const dynamic = "force-dynamic";

export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { initialUser, initialMemberships } = await loadHubAuthSeed();
  return (
    <CommunityLayoutClient
      params={params}
      initialUser={initialUser}
      initialMemberships={initialMemberships}
    >
      {children}
    </CommunityLayoutClient>
  );
}
