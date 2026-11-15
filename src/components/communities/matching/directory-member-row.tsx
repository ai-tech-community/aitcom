"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { profileTabHref } from "@/lib/member-profile-routes";
import type { RouterOutputs } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { MemberPreviewCard } from "@/components/members/member-preview-card";
import { MemberIdentity } from "./member-identity";

export type DirectoryMember =
  RouterOutputs["communities"]["getMembers"]["items"][number];

/**
 * One person in a community's People directory. The row opens the member's
 * profile when the viewer may see it (the whole row is the click target),
 * and hovering it previews who they are. The server decides `canOpenProfile`
 * and `profile`, so a private profile is neither linked nor previewed.
 */
export function DirectoryMemberRow({ member }: { member: DirectoryMember }) {
  const t = useTranslations("communityMatching");
  const roles = useTranslations("communities.roles");
  const identity = (
    <MemberIdentity member={member} fallback={t("memberFallback")} />
  );
  return (
    <li className="group relative flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <HoverCard openDelay={300} closeDelay={100}>
          <HoverCardTrigger asChild>
            {member.canOpenProfile ? (
              <Link
                href={profileTabHref(member.userId, "overview")}
                className="focus-visible:ring-ring/50 block rounded-md outline-none after:absolute after:inset-0 focus-visible:ring-[3px] group-hover:[&_[data-slot=member-name]]:underline"
              >
                {identity}
              </Link>
            ) : (
              <div>{identity}</div>
            )}
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80">
            <MemberPreview member={member} />
          </HoverCardContent>
        </HoverCard>
        {member.bio && (
          <p className="text-muted-foreground mt-2 max-w-prose text-sm break-words">
            {member.bio}
          </p>
        )}
      </div>
      {member.role !== "member" && (
        <Badge variant="secondary">{roles(member.role)}</Badge>
      )}
    </li>
  );
}

function MemberPreview({ member }: { member: DirectoryMember }) {
  const t = useTranslations("communityMatching");
  const roles = useTranslations("communities.roles");
  const format = useFormatter();
  const joined = format.dateTime(member.joinedAt, {
    month: "long",
    year: "numeric",
  });
  return (
    <MemberPreviewCard
      name={member.displayName ?? t("memberFallback")}
      image={member.image}
      bio={member.bio}
      profile={member.profile}
      canOpenProfile={member.canOpenProfile}
      footer={
        member.role === "member"
          ? t("previewJoined", { date: joined })
          : t("previewRoleJoined", { role: roles(member.role), date: joined })
      }
    />
  );
}
