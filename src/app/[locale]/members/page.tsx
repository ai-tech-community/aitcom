import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { MemberSearch } from "@/components/member-search";
import { BotIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Members",
  description:
    "Meet the members of AIT Community - AI practitioners and innovators worldwide.",
  ...buildOgMeta(
    "Members",
    "Meet the members of AIT Community - AI practitioners and innovators worldwide.",
    "Members",
  ),
  alternates: buildAlternates("/members"),
};

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const t = await getTranslations("members");
  const { q } = await searchParams;

  const members = await api.members.listMembers({ limit: 50, search: q });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Page Header */}
      <div className="border-border border-b pb-4">
        <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("leaderboard").toUpperCase()}
        </h1>
      </div>

      {/* Search */}
      <MemberSearch />

      {/* Leaderboard Table */}
      {members.items.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center font-mono text-xs tracking-wider">
          / {t("noMembers").toUpperCase()}
        </p>
      ) : (
        <>
        {/* Mobile: stacked cards */}
        <div className="mt-6 space-y-0 sm:hidden">
          {members.items.map((member, i) => {
            const rank = i + 1;
            const avatarUrl = getAvatarUrl(member.email, member.image);
            const initials = getInitials(member.profile.displayName);
            const skills = member.profile.skills.slice(0, 3);
            const isTopThree = rank <= 3;

            return (
              <Link
                key={member.profile.userId}
                href={`/members/${member.profile.userId}`}
                className="border-border hover:bg-secondary/50 flex items-start gap-3 border-b px-2 py-3.5 transition-colors"
              >
                <span
                  className={`shrink-0 pt-0.5 font-mono text-xs ${isTopThree ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  {rank}
                </span>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are dynamic external sources
                  <img
                    src={avatarUrl}
                    alt={member.profile.displayName}
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="bg-secondary text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[9px]">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {member.profile.displayName}
                    </span>
                    {member.hasAgent && (
                      <BotIcon className="h-3.5 w-3.5 text-primary" aria-label="Has AI Agent" />
                    )}
                    <span className="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wider">
                      {t("level")} {member.profile.level}
                    </span>
                  </div>
                  {member.profile.company && (
                    <span className="text-muted-foreground block truncate font-mono text-[11px]">
                      @ {member.profile.company}
                    </span>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`font-mono text-[11px] ${isTopThree ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {member.profile.xp} XP
                    </span>
                    {member.badgeCount > 0 && (
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {member.badgeCount} {member.badgeCount === 1 ? "badge" : "badges"}
                      </span>
                    )}
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[9px] tracking-wider"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: table layout */}
        <div className="mt-6 hidden sm:block">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-border border-b">
                <th className="text-muted-foreground py-2 pr-4 text-left font-medium tracking-wider">
                  #
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  MEMBER
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  LVL
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  XP
                </th>
                <th className="text-muted-foreground py-2 pr-6 text-left font-medium tracking-wider">
                  BADGES
                </th>
                <th className="text-muted-foreground py-2 text-left font-medium tracking-wider">
                  SKILLS
                </th>
              </tr>
            </thead>
            <tbody>
              {members.items.map((member, i) => {
                const rank = i + 1;
                const avatarUrl = getAvatarUrl(member.email, member.image);
                const initials = getInitials(member.profile.displayName);
                const skills = member.profile.skills.slice(0, 3);
                const isTopThree = rank <= 3;

                return (
                  <tr
                    key={member.profile.userId}
                    className="border-border hover:bg-secondary/50 border-b transition-colors"
                  >
                    <td className="py-3 pr-4 align-top">
                      <span
                        className={
                          isTopThree
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {rank}
                      </span>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <Link
                        href={`/members/${member.profile.userId}`}
                        className="flex items-start gap-2"
                      >
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are dynamic external sources
                          <img
                            src={avatarUrl}
                            alt={member.profile.displayName}
                            className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="bg-secondary text-muted-foreground mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px]">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-foreground">
                              {member.profile.displayName}
                            </span>
                            {member.hasAgent && (
                              <BotIcon className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Has AI Agent" />
                            )}
                          </span>
                          {member.profile.company && (
                            <span className="text-muted-foreground block truncate">
                              @ {member.profile.company}
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] tracking-wider">
                        {t("level")} {member.profile.level}
                      </span>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <span
                        className={
                          isTopThree
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {member.profile.xp}
                      </span>
                    </td>
                    <td className="py-3 pr-6 align-top">
                      <span className="text-muted-foreground">
                        {member.badgeCount > 0 ? member.badgeCount : "-"}
                      </span>
                    </td>
                    <td className="py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {skills.length > 0 ? (
                          skills.map((skill) => (
                            <span
                              key={skill}
                              className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 text-[10px] tracking-wider"
                            >
                              {skill}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
