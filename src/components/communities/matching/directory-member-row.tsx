"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { profileTabHref } from "@/lib/member-profile-routes";
import type { RouterOutputs } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
  const tProfile = useTranslations("memberProfile");
  const tTiers = useTranslations("tiers");
  const roles = useTranslations("communities.roles");
  const format = useFormatter();
  const name = member.displayName ?? t("memberFallback");
  const { profile } = member;
  const joined = format.dateTime(member.joinedAt, {
    month: "long",
    year: "numeric",
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-12 shrink-0">
          {member.image && <AvatarImage src={member.image} alt="" />}
          <AvatarFallback className="font-mono">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold break-words">{name}</p>
          {profile && (
            <p className="text-muted-foreground font-mono text-xs">
              {tProfile("levelTier", {
                level: profile.level,
                tier: tTiers(profile.tier),
              })}
            </p>
          )}
        </div>
      </div>
      {profile?.company && (
        <p className="text-muted-foreground text-sm break-words">
          {tProfile("company", { company: profile.company })}
        </p>
      )}
      {member.bio && (
        <p className="line-clamp-4 text-sm break-words">{member.bio}</p>
      )}
      {profile && profile.skills.length > 0 && (
        <ul aria-label={t("previewSkills")} className="flex flex-wrap gap-1.5">
          {profile.skills.map((skill) => (
            <li key={skill}>
              <Badge variant="outline">{skill}</Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3 text-xs">
        <span>
          {member.role === "member"
            ? t("previewJoined", { date: joined })
            : t("previewRoleJoined", {
                role: roles(member.role),
                date: joined,
              })}
        </span>
        {!member.canOpenProfile && <span>{t("previewPrivate")}</span>}
      </div>
    </div>
  );
}
