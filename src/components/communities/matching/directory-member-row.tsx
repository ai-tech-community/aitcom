"use client";

import { useId } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  memberHeadline,
  rosterSubtitle,
  showNewMemberBadge,
  type RosterCaption,
} from "@/lib/member-directory";
import { profileTabHref } from "@/lib/member-profile-routes";
import type { RouterOutputs } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { MemberPreviewCard } from "@/components/members/member-preview-card";
import { RosterMessageAction } from "@/components/members/roster-message-action";
import { RosterCaptionText } from "@/components/members/roster-caption";
import { MemberIdentity } from "./member-identity";

export type DirectoryMember =
  RouterOutputs["communities"]["getMembers"]["items"][number];

/**
 * One person in a community's People directory. The row opens the member's
 * profile when the viewer may see it (the whole row is the click target),
 * and hovering it previews who they are. The server decides `canOpenProfile`
 * and `profile`, so a private profile is neither linked nor previewed.
 */
export function DirectoryMemberRow({
  member,
  viewerId,
  communityCreatedAt,
  caption,
}: {
  member: DirectoryMember;
  viewerId?: string | null;
  communityCreatedAt?: Date;
  caption?: RosterCaption;
}) {
  const t = useTranslations("communityMatching");
  const roles = useTranslations("communities.roles");
  const identity = (
    <MemberIdentity member={member} fallback={t("memberFallback")} />
  );
  if (viewerId !== undefined) {
    return (
      <PeopleRow
        member={member}
        viewerId={viewerId}
        communityCreatedAt={communityCreatedAt}
        caption={caption}
      />
    );
  }
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

function PeopleRow({
  member,
  viewerId,
  communityCreatedAt,
  caption,
}: {
  member: DirectoryMember;
  viewerId: string | null;
  communityCreatedAt?: Date;
  caption?: RosterCaption;
}) {
  const t = useTranslations("redesign.members");
  const legacy = useTranslations("communityMatching");
  const roles = useTranslations("communities.roles");
  const now = useNow();
  const captionId = useId();
  const name = member.displayName ?? legacy("memberFallback");
  const profile = member.canOpenProfile ? member.profile : null;
  const bio = member.canOpenProfile ? member.bio : null;
  const headline = memberHeadline(profile?.company, bio);
  const role = roles(member.role);
  const subtitle = rosterSubtitle({
    headline,
    role: member.role === "member" ? role : null,
  });
  const captionIsRole = caption?.kind === "text" && caption.text === role;
  const description = bio?.trim() === headline ? null : bio;
  const isNew =
    communityCreatedAt &&
    showNewMemberBadge(member.joinedAt, communityCreatedAt, now);
  const skills = profile?.skills.slice(0, 3) ?? [];
  const identity = (
    <MemberIdentity
      member={member}
      fallback={name}
      spacious
      details={
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {member.role !== "member" && !captionIsRole && (
            <Badge variant="secondary">{role}</Badge>
          )}
          {(caption ?? subtitle) && (
            <span
              id={caption ? captionId : undefined}
              dir="auto"
              className="text-sm wrap-break-word"
            >
              {caption ? <RosterCaptionText caption={caption} /> : subtitle}
            </span>
          )}
          {!member.canOpenProfile && <span>{t("privateProfile")}</span>}
          {isNew && <Badge variant="outline">{t("newMember")}</Badge>}
        </div>
      }
    />
  );

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 sm:gap-x-6 sm:py-1.5">
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          {member.canOpenProfile ? (
            <Link
              href={profileTabHref(member.userId, "overview")}
              aria-label={name}
              aria-describedby={caption ? captionId : undefined}
              className="focus-visible:ring-ring w-fit min-w-0 rounded-md underline-offset-4 outline-none focus-visible:ring-2 hover:[&_[data-slot=member-name]]:underline"
            >
              {identity}
            </Link>
          ) : (
            <div>{identity}</div>
          )}
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="w-80 max-w-[90vw] motion-reduce:animate-none"
        >
          <MemberPreview member={member} protectBio />
        </HoverCardContent>
      </HoverCard>

      <RosterMessageAction
        memberId={member.userId}
        name={name}
        viewerId={viewerId}
        canOpenProfile={member.canOpenProfile}
      />

      {(Boolean(description) || skills.length > 0) && (
        <div className="col-span-full min-w-0 space-y-2 pl-14">
          {description && (
            <p
              dir="auto"
              className="text-muted-foreground max-w-prose text-sm leading-relaxed wrap-break-word"
            >
              {description}
            </p>
          )}
          {skills.length > 0 && (
            <ul aria-label={t("skills")} className="flex flex-wrap gap-1.5">
              {skills.map((skill, index) => (
                <li key={index}>
                  <Badge
                    variant="outline"
                    className="text-muted-foreground max-w-full whitespace-normal"
                  >
                    {skill}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function MemberPreview({
  member,
  protectBio = false,
}: {
  member: DirectoryMember;
  protectBio?: boolean;
}) {
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
      bio={!protectBio || member.canOpenProfile ? member.bio : null}
      profile={!protectBio || member.canOpenProfile ? member.profile : null}
      canOpenProfile={member.canOpenProfile}
      footer={
        member.role === "member"
          ? t("previewJoined", { date: joined })
          : t("previewRoleJoined", { role: roles(member.role), date: joined })
      }
    />
  );
}
