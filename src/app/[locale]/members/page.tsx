import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { MemberSearch } from "@/components/member-search";

export default async function MembersPage() {
  const t = await getTranslations("members");

  const [leaderboard, members] = await Promise.all([
    api.members.getLeaderboard(),
    api.members.listMembers({ limit: 20 }),
  ]);

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="mt-6">
          <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
            / {t("leaderboard").toUpperCase()}
          </span>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {leaderboard.map((member, i) => {
              const avatarUrl = getAvatarUrl(member.email, member.image);
              const initials = getInitials(member.profile.displayName);
              return (
                <Link
                  key={member.profile.userId}
                  href={`/members/${member.profile.userId}`}
                  className="border-border hover:bg-secondary/50 flex min-w-[140px] items-center gap-3 rounded border px-3 py-2.5 transition-colors"
                >
                  <span className="text-muted-foreground font-mono text-[11px] font-medium">
                    #{i + 1}
                  </span>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={member.profile.displayName}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="bg-secondary text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.profile.displayName}
                    </p>
                    <p className="text-muted-foreground font-mono text-[10px] tracking-wider">
                      {t("level")} {member.profile.level} · {member.badgeCount}{" "}
                      {t("badges").toLowerCase()}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <MemberSearch />

      {/* Member Grid (server-rendered initial load) */}
      {members.items.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {t("noMembers")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.items.map((member) => {
            const avatarUrl = getAvatarUrl(member.email, member.image);
            const initials = getInitials(member.profile.displayName);
            const skills = (member.profile.skills as string[]).slice(0, 3);
            return (
              <Link
                key={member.profile.userId}
                href={`/members/${member.profile.userId}`}
                className="border-border hover:bg-secondary/50 rounded border px-4 py-4 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={member.profile.displayName}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="bg-secondary text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full font-mono text-xs">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {member.profile.displayName}
                      </span>
                      <span className="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider">
                        {t("level")} {member.profile.level}
                      </span>
                    </div>
                    {member.profile.company && (
                      <p className="text-muted-foreground truncate font-mono text-xs">
                        @ {member.profile.company}
                      </p>
                    )}
                  </div>
                </div>
                {skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
