import type { Metadata } from "next";
import Image from "next/image";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import { getInitials } from "@/lib/avatar";
import { xpForNextLevel, tierForXp } from "@/lib/gamification";
import { AchievementBadge } from "@/components/gamification/achievement-badge";
import { VerifiedSocials } from "@/components/verified-socials";
import { db } from "@/server/db";
import { agentProfiles } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { Link } from "@/i18n/navigation";
import { getSession } from "@/server/better-auth/server";
import { MessageMemberButton } from "@/components/message-member-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await api.members.getPublicProfile({ userId: id });
  if (!data) return {};

  const description = data.profile.bio
    ? data.profile.bio.slice(0, 160)
    : `Member of AIT Community - Level ${data.profile.level}`;

  return {
    title: data.profile.displayName,
    description,
    ...buildOgMeta(data.profile.displayName, description),
    alternates: buildAlternates(`/members/${id}`),
  };
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, t, tBadges, tTiers] = await Promise.all([
    params,
    getTranslations("members"),
    getTranslations("badges"),
    getTranslations("tiers"),
  ]);

  const [data, [agentProfile], session] = await Promise.all([
    api.members.getPublicProfile({ userId: id }),
    db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, id))
      .limit(1),
    getSession(),
  ]);
  if (!data) notFound();

  const {
    profile,
    user: memberUser,
    badges,
    certificates,
    eventsAttended,
    social,
  } = data;

  // Filter out badges where the BADGES lookup returned undefined (noUncheckedIndexedAccess)
  const validBadges = badges.filter(
    (b): b is typeof b & { slug: string } => b.slug != null,
  );

  const avatarUrl = memberUser?.avatarUrl ?? memberUser?.image ?? null;
  const initials = getInitials(profile.displayName);
  const xpProgress = xpForNextLevel(profile.xp);
  const tier = tierForXp(profile.xp);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-5">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={profile.displayName}
            className="h-20 w-20 rounded-full"
            width={80}
            height={80}
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex h-20 w-20 items-center justify-center rounded-full font-mono text-xl font-medium">
            {initials}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {profile.displayName}
            </h1>
            <span className="border-border text-foreground rounded border px-2 py-0.5 font-mono text-xs font-medium tracking-wider uppercase">
              {tTiers(tier.key)}
            </span>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              {t("level")} {profile.level}
            </span>
            {session?.user && session.user.id !== id && (
              <MessageMemberButton recipientId={id} />
            )}
          </div>
          {profile.company && (
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              @ {profile.company}
            </p>
          )}
          {/* XP progress */}
          <div className="mt-3 flex items-center gap-2">
            <div className="bg-secondary h-1.5 w-24 rounded-full sm:w-32">
              <div
                className="bg-primary h-1.5 rounded-full"
                style={{
                  width: `${(xpProgress.current / xpProgress.needed) * 100}%`,
                }}
              />
            </div>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              {profile.xp} {t("xp")}
            </span>
          </div>
        </div>
      </div>

      <VerifiedSocials
        className="mt-6"
        github={social.github}
        linkedin={social.linkedin}
        websiteUrl={social.website?.url ?? profile.websiteUrl}
        githubLabel={t("github")}
        linkedinLabel={t("linkedin")}
        websiteLabel={t("website")}
        verifiedLabel={t("verified")}
      />

      {/* Bio */}
      {profile.bio && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("bio").toUpperCase()}
            </h2>
          </div>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Skills */}
      {profile.skills.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("skills").toUpperCase()}
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-xs tracking-wider"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {validBadges.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("badges").toUpperCase()}
            </h2>
          </div>
          <div className="mt-6 flex flex-wrap gap-6">
            {validBadges.map((badge) => (
              <AchievementBadge
                key={badge.slug}
                badgeSize="default"
                achievement={{
                  id: badge.slug,
                  name: tBadges(badge.slug),
                  trigger: "metric",
                  progress: 100,
                  achievedAt: badge.earnedAt
                    ? new Date(badge.earnedAt).toISOString()
                    : null,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Hackathon certificates */}
      {certificates.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("certificates").toUpperCase()}
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="border-border rounded border border-dashed px-3 py-2.5"
              >
                <p className="font-mono text-xs font-medium">
                  {cert.challengeTitle ?? t("certificateUntitled")}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-xs tracking-wider">
                  {(cert.kind === "winner"
                    ? t("certificateWinner")
                    : t("certificateParticipant")
                  ).toUpperCase()}
                  {" · "}
                  {new Date(cert.issuedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="border-border mt-8 border-t pt-8">
        <div className="flex gap-8">
          <div>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              {t("eventsAttended").toUpperCase()}
            </span>
            <p className="mt-1 text-2xl font-semibold">{eventsAttended}</p>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              {t("badges").toUpperCase()}
            </span>
            <p className="mt-1 text-2xl font-semibold">{badges.length}</p>
          </div>
        </div>
      </div>

      {/* AI Agent */}
      {agentProfile?.status === "active" && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / AI AGENT
            </h2>
          </div>
          <Link
            href={`/members/${id}/agent`}
            className="border-border hover:bg-secondary/50 mt-4 flex items-center gap-4 rounded border p-4 transition-colors"
          >
            {agentProfile.avatar ? (
              <Image
                src={agentProfile.avatar}
                alt={agentProfile.name}
                className="h-10 w-10 rounded-full"
                width={40}
                height={40}
              />
            ) : (
              <div className="bg-secondary text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full text-lg">
                🤖
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium">{agentProfile.name}</p>
              <p className="text-muted-foreground font-mono text-xs tracking-wider">
                {agentProfile.totalContributions} contributions
              </p>
            </div>
            <span className="text-muted-foreground font-mono text-xs">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
