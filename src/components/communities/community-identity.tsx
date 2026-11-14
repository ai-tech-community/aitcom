"use client";

import type { MembershipStatus as ViewerMembershipStatus } from "@/server/communities/invite-policy";
import { useRef, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { JoinButton } from "./join-button";
import { MemberStack } from "./member-stack";
import type { CommunityIdentityDensity } from "@/lib/communities/layout-variant";
import type { RouterOutputs } from "@/trpc/react";

type Community = RouterOutputs["communities"]["getBySlug"];
type MembershipStatus = ViewerMembershipStatus | null;
type MemberRole = "owner" | "admin" | "moderator" | "member";

interface CommunityIdentityProps {
  community: Community;
  membershipStatus: MembershipStatus;
  memberRole?: MemberRole | null;
  /**
   * `full` (the default) is the whole introduction. `compact` is one row of
   * logo, name and role, for a member's pages past the Overview — see
   * `resolveCommunityIdentityDensity`.
   */
  density?: CommunityIdentityDensity;
}

const LOGO_CLASSES: Record<
  CommunityIdentityDensity,
  { root: string; fallback: string }
> = {
  full: {
    root: "size-16 rounded-xl sm:size-20",
    fallback: "rounded-xl text-lg",
  },
  compact: { root: "size-10 shrink-0 rounded-lg", fallback: "rounded-lg" },
};

function CommunityLogo({
  community,
  density,
}: {
  community: Community;
  density: CommunityIdentityDensity;
}) {
  const classes = LOGO_CLASSES[density];
  return (
    <Avatar className={classes.root}>
      {community.logoUrl ? (
        <AvatarImage src={community.logoUrl} alt={community.name} />
      ) : null}
      <AvatarFallback className={classes.fallback}>
        {getInitials(community.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** The community name — the page's one h1 — and the viewer's role. */
function CommunityHeading({
  name,
  role,
  headingRef,
  className,
}: {
  name: string;
  role: MemberRole | null;
  headingRef?: Ref<HTMLHeadingElement>;
  className: string;
}) {
  const tRoles = useTranslations("communities.roles");
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className={cn(
          "min-w-0 font-semibold tracking-tight wrap-break-word outline-none",
          className,
        )}
      >
        {name}
      </h1>
      {role ? <Badge variant="outline">{tRoles(role)}</Badge> : null}
    </div>
  );
}

/**
 * Who the community is and the way in: logo, name (the page's one h1),
 * tagline, members, and the join control. A header row on small screens;
 * from `lg` it stacks into the top of the community rail.
 */
export function CommunityIdentity({
  community,
  membershipStatus,
  memberRole,
  density = "full",
}: CommunityIdentityProps) {
  const role = membershipStatus === "active" && memberRole ? memberRole : null;

  if (density === "compact") {
    // A member is already in: the menu matters more than the introduction.
    // Leave Community stays on the Overview's full identity.
    return (
      <div
        data-community-identity=""
        data-density="compact"
        className="flex items-center gap-3"
      >
        <CommunityLogo community={community} density="compact" />
        <CommunityHeading
          name={community.name}
          role={role}
          className="text-lg leading-snug"
        />
      </div>
    );
  }

  return (
    <FullCommunityIdentity
      community={community}
      membershipStatus={membershipStatus}
      memberRole={memberRole}
      role={role}
    />
  );
}

function FullCommunityIdentity({
  community,
  membershipStatus,
  memberRole,
  role,
}: Omit<CommunityIdentityProps, "density"> & { role: MemberRole | null }) {
  const t = useTranslations("communities.profile");

  const active = community.liveness?.activeContributors ?? 0;
  // Focus lands here after answering an invitation: the heading gains the
  // Member badge (or stays as it was, after a decline).
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <div
      data-community-identity=""
      data-density="full"
      className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:justify-start lg:gap-4"
    >
      {community.bannerUrl ? (
        // Uploaded hosts are not limited to next/image's allow list.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={community.bannerUrl}
          alt={community.bannerAlt ?? ""}
          data-community-banner=""
          className="border-border aspect-[3/1] w-full rounded-lg border object-cover"
        />
      ) : null}

      <div className="flex items-start gap-4 lg:flex-col lg:gap-3">
        <CommunityLogo community={community} density="full" />

        <div className="flex min-w-0 flex-col gap-1 lg:gap-2">
          <CommunityHeading
            name={community.name}
            role={role}
            headingRef={headingRef}
            className="text-2xl sm:text-3xl lg:text-2xl"
          />

          {community.description ? (
            <p
              data-community-tagline=""
              className="text-muted-foreground line-clamp-2 max-w-2xl text-sm leading-relaxed sm:text-base lg:line-clamp-6 lg:text-sm"
            >
              {community.description}
            </p>
          ) : null}

          <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Users className="size-4" />
            <span>
              {t("membersSentence", { count: community.memberCount })}
              {active > 0 ? (
                <> · {t("activeSentence", { count: active })}</>
              ) : null}
            </span>
          </div>

          <MemberStack slug={community.slug} className="mt-1" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <JoinButton
          slug={community.slug}
          name={community.name}
          joinPolicy={community.joinPolicy}
          membershipStatus={membershipStatus}
          memberRole={memberRole}
          focusAfterAnswer={headingRef}
        />
      </div>
    </div>
  );
}
