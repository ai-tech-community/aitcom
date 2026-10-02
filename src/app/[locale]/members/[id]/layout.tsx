import { getSession } from "@/server/better-auth/server";
import {
  getMemberAgentAccess,
  getMemberCommunities,
  requireMemberFrame,
} from "@/server/members/profile-page";
import { OwnerOnlyNotice } from "@/components/members/owner-only-notice";
import {
  IdentityPanel,
  SetupIdentityPanel,
} from "@/components/members/profile/identity-panel";
import { ProfileTabs } from "@/components/members/profile/profile-tabs";

/**
 * The member profile frame, shared by every tab: the identity panel (the
 * page's one h1) beside the tabs and the tab's own content. Visibility is
 * decided here and again by each tab page through the same loader, so a
 * visitor gets a 404 for a profile they may not see and the owner gets a
 * notice when visitors cannot see it. An owner without a profile yet gets
 * the frame too, with Overview asking them to set it up.
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
  const [frame, agentAccess, session] = await Promise.all([
    requireMemberFrame(id),
    getMemberAgentAccess(id),
    getSession(),
  ]);
  const communities =
    frame.kind === "profile" ? await getMemberCommunities(id) : null;

  return (
    <div className="px-4 py-8 sm:px-8">
      {frame.kind === "profile" && <OwnerOnlyNotice reach={frame.data.reach} />}
      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]">
          {frame.kind === "profile" ? (
            <IdentityPanel
              data={frame.data}
              communities={communities ?? []}
              viewerSignedIn={!!session?.user}
            />
          ) : (
            <SetupIdentityPanel name={frame.name} avatarUrl={frame.avatarUrl} />
          )}
        </div>
        {/* Not <main>: the root layout already provides the main landmark. */}
        <div className="min-w-0">
          <ProfileTabs
            userId={id}
            showAgent={agentAccess !== null}
            hasProfile={frame.kind === "profile"}
          />
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
