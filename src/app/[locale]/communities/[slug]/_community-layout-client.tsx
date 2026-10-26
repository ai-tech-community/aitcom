"use client";

import { use } from "react";
import { notFound, useSelectedLayoutSegments } from "next/navigation";
import { api } from "@/trpc/react";
import { PageDocumentAuthProvider } from "@/components/auth/session-provider";
import { authClient } from "@/server/better-auth/client";
import {
  documentAuthUser,
  membershipStatusForSlug,
  memberRoleForSlug,
  type HubAuthUser,
  type HubMembershipSeed,
} from "@/server/better-auth/hub-session";
import { CommunityIdentity } from "@/components/communities/community-identity";
import { CommunityNav } from "@/components/communities/community-nav";
import { Spinner } from "@/components/ui/spinner";
import { resolveCommunityLayoutVariant } from "@/lib/communities/layout-variant";
import { useJoinDeepLink } from "@/components/communities/use-community-join";
import { useRouter } from "@/i18n/navigation";

export function CommunityLayoutClient({
  children,
  params,
  initialUser,
  initialMemberships,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
  initialUser: HubAuthUser | null;
  initialMemberships: HubMembershipSeed[];
}) {
  const { slug } = use(params);
  const router = useRouter();
  // A guest who pressed Join here comes back from sign-in with ?join=.
  useJoinDeepLink(() => router.refresh());
  const variant = resolveCommunityLayoutVariant(useSelectedLayoutSegments());
  const { data: session } = authClient.useSession();
  const user = documentAuthUser(null, initialUser, session?.user);

  const { data: community, isLoading: communityLoading } =
    api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!user },
  );

  if (communityLoading) {
    return (
      <PageDocumentAuthProvider user={initialUser}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Spinner className="size-8" />
        </div>
      </PageDocumentAuthProvider>
    );
  }

  if (!community) {
    notFound();
  }

  const memberships = myCommunities ?? initialMemberships;
  const membershipStatus = membershipStatusForSlug(memberships, slug);
  const memberRole = memberRoleForSlug(memberships, slug);

  return (
    <PageDocumentAuthProvider user={initialUser}>
      {variant === "workspace" ? (
        children
      ) : (
        // Full width on the top nav's gutters, with the community rail on the
        // left from `lg` — a named exception to the default page frame
        // (DESIGN.md "Page frame"). Below `lg` the rail's wrapper drops out
        // (`contents`), so identity and the sticky tab bar stack above the page.
        <div className="px-4 py-8 sm:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
            <div
              data-community-rail=""
              className="contents lg:sticky lg:top-24 lg:-m-1 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:flex-col lg:gap-6 lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:p-1 lg:[scrollbar-width:thin]"
            >
              <CommunityIdentity
                community={community}
                membershipStatus={membershipStatus}
                memberRole={memberRole}
              />
              <CommunityNav slug={slug} memberRole={memberRole} />
            </div>
            {/* Not <main>: the root layout already provides the main landmark. */}
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      )}
    </PageDocumentAuthProvider>
  );
}
