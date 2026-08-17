"use client";

import { BotIcon, Lock } from "lucide-react";
import { VerifiedSocials } from "@/components/verified-socials";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { RelativeTime } from "@/components/ui/relative-time";
import { SectionLabel } from "@/components/ui/section-label";
import { getInitials } from "@/lib/avatar";

type ProfilePaneProps = {
  /** A peer userId (DM). Null for agent conversations. */
  peerUserId: string | null;
  /** Used as the header fallback while the profile loads or stays private. */
  fallbackName: string;
  fallbackImage: string | null;
  isAgent: boolean;
  agentInfo?: {
    name: string;
    avatar: string | null;
    lastActiveAt: Date | string | null;
  } | null;
};

function MonoFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        {label}
      </span>
      <span className="text-foreground font-mono text-xs">{children}</span>
    </div>
  );
}

export function ProfilePane({
  peerUserId,
  fallbackName,
  fallbackImage,
  isAgent,
  agentInfo,
}: ProfilePaneProps) {
  const t = useTranslations("inbox");

  const profileQuery = api.members.getPublicProfile.useQuery(
    { userId: peerUserId ?? "" },
    { enabled: !isAgent && !!peerUserId },
  );

  // ── Agent conversation: show agent info, not a member profile ──────────────
  if (isAgent) {
    const name = agentInfo?.name ?? fallbackName;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Header label={t("profileKicker")} />
        <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
          <div className="relative">
            <Avatar className="size-20">
              {agentInfo?.avatar && (
                <AvatarImage src={agentInfo.avatar} alt={name} />
              )}
              <AvatarFallback className="text-xl">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <span className="bg-background absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full">
              <BotIcon className="text-muted-foreground h-4 w-4" />
            </span>
          </div>
          <div>
            <p className="text-foreground text-base font-semibold">{name}</p>
            <span className="border-border text-muted-foreground mt-2 inline-block rounded border px-2 py-0.5 font-mono text-xs tracking-wider uppercase">
              {t("agentRole")}
            </span>
          </div>
        </div>
        {agentInfo?.lastActiveAt && (
          <div className="border-border border-t px-5 py-4">
            <MonoFact label={t("lastActive")}>
              <RelativeTime
                date={agentInfo.lastActiveAt}
                className="text-foreground text-xs"
              />
            </MonoFact>
          </div>
        )}
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (profileQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Header label={t("profileKicker")} />
        <div className="flex flex-col items-center gap-3 px-5 py-6">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="space-y-2 px-5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    );
  }

  const data = profileQuery.data;

  // ── Private / unavailable ──────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Header label={t("profileKicker")} />
        <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
          <Avatar className="size-20">
            {fallbackImage && (
              <AvatarImage src={fallbackImage} alt={fallbackName} />
            )}
            <AvatarFallback className="text-xl">
              {getInitials(fallbackName)}
            </AvatarFallback>
          </Avatar>
          <p className="text-foreground text-base font-semibold">
            {fallbackName}
          </p>
          <p className="text-muted-foreground text-sm">{t("profilePrivate")}</p>
        </div>
      </div>
    );
  }

  const { profile } = data;
  const image = data.user?.avatarUrl ?? data.user?.image ?? fallbackImage;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Header label={t("profileKicker")} />

      {/* Identity */}
      <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
        <Avatar className="size-20">
          {image && <AvatarImage src={image} alt={profile.displayName} />}
          <AvatarFallback className="text-xl">
            {getInitials(profile.displayName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground text-base font-semibold">
            {profile.displayName}
          </p>
          {profile.company && (
            <p className="text-muted-foreground mt-0.5 text-xs">
              @ {profile.company}
            </p>
          )}
        </div>

        <VerifiedSocials
          github={data.social.github}
          linkedin={data.social.linkedin}
          websiteUrl={data.social.website?.url ?? profile.websiteUrl}
          githubLabel="GitHub"
          linkedinLabel="LinkedIn"
          websiteLabel="Website"
          verifiedLabel={t("verified")}
        />
      </div>

      {/* Facts */}
      <div className="border-border border-t px-5 py-4">
        <MonoFact label={t("memberSince")}>
          {new Date(profile.createdAt).toLocaleDateString(undefined, {
            month: "short",
            year: "numeric",
          })}
        </MonoFact>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="border-border border-t px-5 py-4">
          <SectionLabel as="h3" bordered={false} className="mb-2">
            {t("bioLabel")}
          </SectionLabel>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Skills */}
      {profile.skills.length > 0 && (
        <div className="border-border border-t px-5 py-4">
          <SectionLabel as="h3" bordered={false} className="mb-2">
            {t("skillsLabel")}
          </SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-xs tracking-wider"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* View full profile */}
      <div className="border-border mt-auto border-t px-5 py-4">
        <Link
          href={`/members/${profile.userId}`}
          className="border-border hover:bg-secondary focus-visible:ring-ring flex items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {t("viewFullProfile")}
        </Link>
      </div>
    </div>
  );
}

type RoomInfoPaneProps = {
  roomName: string;
  roomVisibility: "public" | "private" | null;
  memberCount: number;
  communityName: string | null;
  communityLogoUrl: string | null;
  communitySlug: string | null;
  roomSlug: string | null;
};

export function RoomInfoPane({
  roomName,
  roomVisibility,
  memberCount,
  communityName,
  communityLogoUrl,
  communitySlug,
  roomSlug,
}: RoomInfoPaneProps) {
  const t = useTranslations("communities.rooms");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Header label={`/ ${t("community").toUpperCase()}`} />

      {/* Community identity */}
      <div className="flex flex-col items-center gap-3 px-5 py-6 text-center">
        <Avatar className="size-20">
          {communityLogoUrl && communityName && (
            <AvatarImage src={communityLogoUrl} alt={communityName} />
          )}
          <AvatarFallback className="text-xl">
            {getInitials(communityName ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground text-base font-semibold">
            {communityName ?? "—"}
          </p>
        </div>
      </div>

      {/* Room identity */}
      <div className="border-border space-y-2 border-t px-5 py-4">
        <p className="text-foreground text-sm font-semibold">{roomName}</p>
        <div className="flex items-center gap-2">
          {roomVisibility === "private" ? (
            <Lock className="text-muted-foreground h-3 w-3 shrink-0" />
          ) : null}
          <span className="text-muted-foreground font-mono text-xs">
            {roomVisibility === "private" ? t("private") : t("public")}
          </span>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          {t("memberCount", { count: memberCount })}
        </p>
      </div>

      {/* Open in community link */}
      {communitySlug && roomSlug && (
        <div className="border-border mt-auto border-t px-5 py-4">
          <Link
            href={`/communities/${communitySlug}/spaces/${roomSlug}`}
            className="border-border hover:bg-secondary focus-visible:ring-ring flex items-center justify-center rounded-md border px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {t("openInCommunity")}
          </Link>
        </div>
      )}
    </div>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div className="border-border flex items-center border-b px-5 py-3">
      <SectionLabel bordered={false}>{label}</SectionLabel>
    </div>
  );
}
