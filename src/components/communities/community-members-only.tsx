"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import { isPrivateCommunity } from "@/server/communities/content-visibility";
import { HUB_SLUG } from "@/server/communities/hub";
import {
  viewerJoinAction,
  type JoinPolicy,
  type MembershipStatus,
  type ViewerJoinAction,
} from "@/server/communities/invite-policy";
import type { CommunityRole } from "@/server/communities/role-utils";
import { CommunityDescription } from "./community-about";

type NextStep =
  | "join"
  | "request"
  | "pending"
  | "invited"
  | "inviteOnly"
  | "unavailable"
  | "lapsed";

/**
 * The next step the panel explains (its message key), from the one join
 * rule (`viewerJoinAction`). The join control itself stays in the
 * community rail; this only says what it leads to. An active member who
 * still may not read is one whose paid membership lapsed.
 */
const NEXT_STEP: Record<ViewerJoinAction["kind"], NextStep> = {
  join: "join",
  request: "request",
  pending: "pending",
  invited: "invited",
  invite_only: "inviteOnly",
  unavailable: "unavailable",
  member: "lapsed",
};

/**
 * What an outsider sees of a community whose content they may not read
 * (ADR-0050): its description and a short panel saying it is for members
 * and how to get in — join, ask to join, wait for approval, answer an
 * invitation, or ask for an invite. Never its tabs, feed, numbers or
 * faces. The community rail above keeps the name, logo and join control.
 */
export function CommunityMembersOnly({
  community,
  membershipStatus,
  memberRole,
}: {
  community: {
    slug: string;
    name: string;
    description: string | null;
    joinPolicy: JoinPolicy;
  };
  membershipStatus: MembershipStatus | null;
  memberRole?: CommunityRole | null;
}) {
  const t = useTranslations("communities.membersOnly");
  const tProfile = useTranslations("communities.profile");
  const aboutId = useId();
  const headingId = useId();
  const description = community.description?.trim() ?? "";
  const step =
    NEXT_STEP[
      viewerJoinAction({
        joinPolicy: community.joinPolicy,
        status: membershipStatus,
        role: memberRole ?? null,
        isHub: community.slug === HUB_SLUG,
      }).kind
    ];

  return (
    <div data-community-members-only="" className="flex flex-col gap-8">
      {description ? (
        <section aria-labelledby={aboutId} className="flex flex-col gap-3">
          <SectionLabel id={aboutId}>{tProfile("about")}</SectionLabel>
          <CommunityDescription text={description} />
        </section>
      ) : null}
      <section
        aria-labelledby={headingId}
        className="border-border flex max-w-2xl flex-col items-start gap-3 rounded-xl border p-6"
      >
        <Lock className="text-muted-foreground size-5" aria-hidden="true" />
        <h2
          id={headingId}
          className="text-lg leading-snug font-semibold text-balance"
        >
          {isPrivateCommunity(community)
            ? t("titlePrivate")
            : t("titleMembersOnly")}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
          {t(step, { community: community.name })}
        </p>
        {step === "lapsed" ? (
          <Link
            href={`/communities/${community.slug}/offers`}
            className="text-foreground focus-visible:ring-ring/50 rounded-sm text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px]"
          >
            {t("offers")}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
