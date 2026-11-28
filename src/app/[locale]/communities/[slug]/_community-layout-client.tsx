"use client";

import { use } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
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
import { CommunityMembersOnly } from "@/components/communities/community-members-only";
import { CommunityNav } from "@/components/communities/community-nav";
import { useSiteShell } from "@/components/site-chrome-gate";
import { ShellMain } from "@/components/page-main";
import { CommunityThemeCover } from "@/components/communities/theme/community-theme-cover";
import { CommunityThemePreviewProvider } from "@/components/communities/theme/community-theme-preview";
import { CommunityThemeScope } from "@/components/communities/theme/community-theme-scope";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isCommunityOverview,
  isOutsiderRoute,
  resolveCommunityLayoutVariant,
} from "@/lib/communities/layout-variant";
import { useJoinDeepLink } from "@/components/communities/use-community-join";
import { useRouter } from "@/i18n/navigation";

const CommunityShell = dynamic(() =>
  import("@/components/shells/community-shell").then((m) => m.CommunityShell),
);

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
  const segments = useSelectedLayoutSegments();
  const shell = useSiteShell();
  const workspace = shell
    ? shell === "focus"
    : resolveCommunityLayoutVariant(segments) === "workspace";
  const { data: session } = authClient.useSession();
  const user = documentAuthUser(null, initialUser, session?.user);

  const communityQuery = api.communities.getBySlug.useQuery({ slug });

  const membershipQuery = api.communities.getMyCommunities.useQuery(undefined, {
    enabled: !!user,
  });

  const memberships = membershipQuery.data ?? initialMemberships;
  const membershipStatus = membershipStatusForSlug(memberships, slug);
  const memberRole = memberRoleForSlug(memberships, slug);

  // `isLoading` is false while a query is pending but not yet fetching.
  // That is the first paint of a cold visit: the server took the missing
  // community as notFound() and the client took it as a spinner. The
  // mismatch blanks workspace pages such as the issue editor. Wait until
  // the query has actually settled.
  if (communityQuery.isPending) {
    return (
      <PageDocumentAuthProvider user={initialUser}>
        {shell ? (
          <ShellMain data-site-shell={shell}>
            <CommunityShellSkeleton />
          </ShellMain>
        ) : (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Spinner className="size-8" />
          </div>
        )}
      </PageDocumentAuthProvider>
    );
  }

  if (communityQuery.isError || !communityQuery.data) {
    notFound();
  }
  const community = communityQuery.data;
  // Someone who may not read the community's content (an outsider of a
  // private or unlisted community, ADR-0050) gets who it is and how to get
  // in, never its tabs or pages — except the routes that are part of
  // getting in (the paid offers), which keep their own gate.
  const membersOnly = !community.viewerCanReadContent;
  // The panel's next step comes from the same server answer that says the
  // viewer may not read: right after an invite is accepted, the fresh
  // memberships already say "active" while this answer still says "may not
  // read", and mixing the two would flash "your paid membership has ended".
  const page =
    membersOnly && !isOutsiderRoute(segments) ? (
      <CommunityMembersOnly
        community={community}
        membershipStatus={community.viewerMembershipStatus}
        memberRole={memberRole}
      />
    ) : (
      children
    );

  return (
    <PageDocumentAuthProvider user={initialUser}>
      {workspace ? (
        shell === "focus" ? (
          <ShellMain data-site-shell="focus" className="flex-1">
            {children}
          </ShellMain>
        ) : (
          children
        )
      ) : shell === "community" ? (
        <CommunityShell
          key={slug}
          community={community}
          user={user}
          memberRole={
            community.viewerMembershipStatus === "active" ? memberRole : null
          }
          membershipStatus={membershipStatus}
          memberships={membershipQuery.isError ? [] : memberships}
          retryMemberships={
            membershipQuery.isError
              ? () => void membershipQuery.refetch()
              : undefined
          }
          showCover={membersOnly || isCommunityOverview(segments)}
        >
          {page}
        </CommunityShell>
      ) : (
        // Full width on the top nav's gutters, with the community rail on the
        // left from `lg` — a named exception to the default page frame
        // (DESIGN.md "Page frame"). Below `lg` the rail's wrapper drops out
        // (`contents`), so identity and the sticky tab bar stack above the page.
        // The Overview opens with the cover (banner picture or the look's
        // art) across the full width, and so does the members-only state on
        // every route. The frame wears the community's look edge to edge;
        // workspace pages stay plain. It is at least the screen less the
        // navbar (`h-12` and its 1px border, components/navbar.tsx) tall, so
        // on a short page the look reaches the footer instead of stopping
        // above a white band.
        <CommunityThemePreviewProvider>
          <CommunityThemeScope
            themeId={community.themeId}
            className="min-h-[calc(100svh-3rem-1px)] px-4 py-8 sm:px-8"
          >
            {membersOnly || isCommunityOverview(segments) ? (
              <CommunityThemeCover community={community} className="mb-8" />
            ) : null}
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
                {membersOnly ? null : (
                  <CommunityNav slug={slug} memberRole={memberRole} />
                )}
              </div>
              {/* Not <main>: the root layout already provides the main landmark. */}
              <div className="min-w-0">{page}</div>
            </div>
          </CommunityThemeScope>
        </CommunityThemePreviewProvider>
      )}
    </PageDocumentAuthProvider>
  );
}

function CommunityShellSkeleton() {
  const t = useTranslations("common");
  return (
    <div role="status" aria-label={t("loading")} className="min-h-svh">
      <div className="border-border flex h-[calc(3rem+1px)] items-center border-b px-4">
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="grid min-h-[calc(100svh-3rem-1px)] lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <div className="border-border hidden space-y-3 border-r p-4 lg:block">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-4/5" />
        </div>
        <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <Skeleton className="h-32 w-full sm:h-40 lg:h-44" />
          <Skeleton className="h-40 max-w-2xl" />
        </div>
      </div>
    </div>
  );
}
