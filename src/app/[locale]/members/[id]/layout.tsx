import { getSession } from "@/server/better-auth/server";
import {
  getMemberAgentPage,
  getMemberCommunities,
  requireMemberProfile,
} from "@/server/members/profile-page";
import { OwnerOnlyNotice } from "@/components/members/owner-only-notice";
import { IdentityPanel } from "@/components/members/profile/identity-panel";
import { ProfileTabs } from "@/components/members/profile/profile-tabs";

/**
 * The member profile frame, shared by every tab: the identity panel (the
 * page's one h1) beside the tabs and the tab's own content. Visibility is
 * decided here and again by each tab page through the same loader, so a
 * visitor gets a 404 for a profile they may not see and the owner gets a
 * notice when visitors cannot see it.
 *
 * Full width on the top nav's `px-4 sm:px-8` gutters, like the dashboard —
 * a named exception to the default page frame (DESIGN.md "Page frame").
 */
export default async function MemberProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, agentPage, communities, session] = await Promise.all([
    requireMemberProfile(id),
    getMemberAgentPage(id),
    getMemberCommunities(id),
    getSession(),
  ]);

  return (
    <div className="px-4 py-8 sm:px-8">
      <OwnerOnlyNotice reach={data.reach} />
      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]">
          <IdentityPanel
            data={data}
            communities={communities ?? []}
            viewerSignedIn={!!session?.user}
          />
        </div>
        {/* Not <main>: the root layout already provides the main landmark. */}
        <div className="min-w-0">
          <ProfileTabs userId={id} showAgent={agentPage !== null} />
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
