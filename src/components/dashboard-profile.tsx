"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ProfileEditForm } from "./profile-edit-form";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { xpForNextLevel } from "@/lib/gamification";

interface DashboardProfileProps {
  userEmail: string;
  userImage?: string | null;
  userName?: string | null;
}

export function DashboardProfile({
  userEmail,
  userImage,
  userName,
}: DashboardProfileProps) {
  const t = useTranslations("dashboard");
  const tBadges = useTranslations("badges");
  const tMembers = useTranslations("members");
  const [editing, setEditing] = useState(false);
  const [imgError, setImgError] = useState(false);

  const { data, isLoading } = api.members.getMyProfile.useQuery();

  if (isLoading) {
    return (
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("myProfile")}
        </span>
        <p className="text-muted-foreground mt-4 text-sm">Loading...</p>
      </div>
    );
  }

  const profile = data?.profile;
  const badges = (data?.badges ?? []).filter(
    (b): b is typeof b & { slug: string; description: string } =>
      b.slug != null && b.description != null,
  );

  // No profile yet - show prompt
  if (!profile) {
    return (
      <div>
        <div className="border-border border-b pb-4">
          <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("myProfile")}
          </span>
        </div>
        {!editing ? (
          <div className="mt-4 rounded border border-dashed border-primary/30 px-4 py-6 text-center">
            <p className="text-muted-foreground text-sm">
              {t("completeProfile")}
            </p>
            <button
              onClick={() => setEditing(true)}
              className="text-primary hover:text-primary/80 mt-2 font-mono text-xs tracking-wider underline underline-offset-4"
            >
              {t("completeProfileCta")}
            </button>
          </div>
        ) : (
          <ProfileEditForm initialData={null} />
        )}
      </div>
    );
  }

  // Has profile
  const avatarUrl = getAvatarUrl(userEmail, userImage);
  const initials = getInitials(profile.displayName ?? userName ?? "?");
  const xpProgress = xpForNextLevel(profile.xp);

  return (
    <div>
      <div className="border-border flex items-center justify-between border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("myProfile")}
        </span>
        <button
          onClick={() => setEditing(!editing)}
          className="text-muted-foreground hover:text-foreground font-mono text-[11px] tracking-wider transition-colors"
        >
          [{editing ? "CLOSE" : t("editProfile")}]
        </button>
      </div>

      {editing ? (
        <ProfileEditForm initialData={profile} />
      ) : (
        <div className="mt-4 flex items-start gap-4">
          {/* Avatar */}
          {avatarUrl && !imgError ? (
            <Image
              src={avatarUrl}
              alt={profile.displayName}
              className="h-12 w-12 rounded-full"
              width={48}
              height={48}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="bg-secondary text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full font-mono text-sm font-medium">
              {initials}
            </div>
          )}

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{profile.displayName}</span>
              <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider">
                {tMembers("level")} {profile.level}
              </span>
            </div>
            {profile.company && (
              <span className="text-muted-foreground font-mono text-xs">
                @ {profile.company}
              </span>
            )}
            {/* XP progress bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="bg-secondary h-1.5 flex-1 rounded-full">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{
                    width: `${(xpProgress.current / xpProgress.needed) * 100}%`,
                  }}
                />
              </div>
              <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
                {profile.xp} {tMembers("xp")}
              </span>
            </div>
            {/* Badges row */}
            {badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {badges.map((badge) => (
                  <span
                    key={badge.slug}
                    className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
                    title={badge.description}
                  >
                    {tBadges(badge.slug)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
