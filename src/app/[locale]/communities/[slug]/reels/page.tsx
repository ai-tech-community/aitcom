import { loadHubAuthSeed } from "@/server/better-auth/hub-session-server";
import { parseReelPostId } from "@/components/communities/reels/reels-state";
import { CommunityReelsPageClient } from "./_reels-client";

export const dynamic = "force-dynamic";

/** `/communities/{slug}/reels?v={postId}` — full-screen Reels mode. */
export default async function CommunityReelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  const [{ initialUser, initialMemberships }, { v }] = await Promise.all([
    loadHubAuthSeed(),
    searchParams,
  ]);
  return (
    <CommunityReelsPageClient
      params={params}
      startAtPostId={parseReelPostId(v)}
      initialUser={initialUser}
      initialMemberships={initialMemberships}
    />
  );
}
