import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { xpForNextLevel } from "@/lib/gamification";
import { Linkedin, Github, Globe } from "lucide-react";
import { db } from "@/server/db";
import { agentProfiles } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { Link } from "@/i18n/navigation";

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
    : `Member of AIT Community Netherlands — Level ${data.profile.level}`;

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
  const { id } = await params;
  const t = await getTranslations("members");
  const tBadges = await getTranslations("badges");

  const data = await api.members.getPublicProfile({ userId: id });
  if (!data) notFound();

  const { profile, user: memberUser, badges, eventsAttended } = data;

  // Fetch agent profile for this member
  const [agentProfile] = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.ownerId, id))
    .limit(1);

  // Filter out badges where the BADGES lookup returned undefined (noUncheckedIndexedAccess)
  const validBadges = badges.filter(
    (b): b is typeof b & { slug: string } => b.slug != null,
  );

  const avatarUrl = getAvatarUrl(
    memberUser?.email ?? null,
    memberUser?.image,
    120,
  );
  const initials = getInitials(profile.displayName);
  const xpProgress = xpForNextLevel(profile.xp);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-12">
      {/* Header */}
      <div className="flex items-start gap-5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={profile.displayName}
            className="h-20 w-20 rounded-full"
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex h-20 w-20 items-center justify-center rounded-full font-mono text-xl font-medium">
            {initials}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {profile.displayName}
            </h1>
            <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider">
              {t("level")} {profile.level}
            </span>
          </div>
          {profile.company && (
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              @ {profile.company}
            </p>
          )}
          {/* XP progress */}
          <div className="mt-3 flex items-center gap-2">
            <div className="bg-secondary h-1.5 w-32 rounded-full">
              <div
                className="bg-primary h-1.5 rounded-full"
                style={{
                  width: `${(xpProgress.current / xpProgress.needed) * 100}%`,
                }}
              />
            </div>
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {profile.xp} {t("xp")}
            </span>
          </div>
        </div>
      </div>

      {/* Social Links */}
      {(profile.linkedinUrl ?? profile.githubUrl ?? profile.websiteUrl) && (
        <div className="mt-6 flex gap-3">
          {profile.linkedinUrl && (
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          {profile.githubUrl && (
            <a
              href={profile.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-4 w-4" />
            </a>
          )}
          {profile.websiteUrl && (
            <a
              href={profile.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

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
                className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] tracking-wider"
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
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {validBadges.map((badge) => (
              <div
                key={badge.slug}
                className="border-border rounded border border-dashed px-3 py-2.5"
              >
                <p className="font-mono text-xs font-medium">
                  {tBadges(badge.slug)}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wider">
                  {badge.earnedAt
                    ? new Date(badge.earnedAt).toLocaleDateString()
                    : ""}
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
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {t("eventsAttended").toUpperCase()}
            </span>
            <p className="mt-1 text-2xl font-extrabold">{eventsAttended}</p>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {t("badges").toUpperCase()}
            </span>
            <p className="mt-1 text-2xl font-extrabold">{badges.length}</p>
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
            className="border-border mt-4 flex items-center gap-4 rounded border p-4 transition-colors hover:bg-secondary/50"
          >
            {agentProfile.avatar ? (
              <img
                src={agentProfile.avatar}
                alt={agentProfile.name}
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <div className="bg-secondary text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full text-lg">
                🤖
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium">{agentProfile.name}</p>
              <p className="text-muted-foreground font-mono text-[10px] tracking-wider">
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
