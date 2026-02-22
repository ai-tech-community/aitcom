import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { MemberSearch } from "@/components/member-search";

export default async function MembersPage() {
  const t = await getTranslations("members");

  const members = await api.members.listMembers({ limit: 50 });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Page Header */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("leaderboard").toUpperCase()}
        </span>
      </div>

      {/* Search */}
      <MemberSearch />

      {/* Leaderboard Table */}
      {members.items.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center font-mono text-xs tracking-wider">
          / {t("noMembers").toUpperCase()}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
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
                          <span className="block truncate font-medium text-foreground">
                            {member.profile.displayName}
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
                        {member.badgeCount > 0 ? member.badgeCount : "—"}
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
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
