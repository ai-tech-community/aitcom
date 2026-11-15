"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/avatar";
import type { MemberCardProfile } from "@/server/members/member-card";

/**
 * The body of a member's hover preview: who they are at a glance. Shared by
 * every place a member's name opens a preview (the People directory, the
 * community feed), so a person looks the same wherever you meet them.
 * `footer` adds context the caller knows, such as a role in a community.
 */
export function MemberPreviewCard({
  name,
  image,
  bio,
  profile,
  canOpenProfile,
  footer,
}: {
  name: string;
  image: string | null;
  bio: string | null;
  profile: MemberCardProfile | null;
  canOpenProfile: boolean;
  footer?: ReactNode;
}) {
  const t = useTranslations("memberCard");
  const tProfile = useTranslations("memberProfile");
  const tTiers = useTranslations("tiers");
  const showFooter = footer != null || !canOpenProfile;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-12 shrink-0">
          {image && <AvatarImage src={image} alt="" />}
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
      {bio && <p className="line-clamp-4 text-sm break-words">{bio}</p>}
      {profile && profile.skills.length > 0 && (
        <ul aria-label={t("skills")} className="flex flex-wrap gap-1.5">
          {profile.skills.map((skill) => (
            <li key={skill}>
              <Badge variant="outline">{skill}</Badge>
            </li>
          ))}
        </ul>
      )}
      {showFooter && (
        <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3 text-xs">
          {footer != null && <span>{footer}</span>}
          {!canOpenProfile && <span>{t("private")}</span>}
        </div>
      )}
    </div>
  );
}
