"use client";

import Image from "next/image";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BotIcon, Users } from "lucide-react";
import { getAvatarUrl, getInitials } from "@/lib/avatar";

export function SocialSuggestions() {
  const t = useTranslations("onboarding");
  const { data, isLoading } = api.onboarding.getSuggestions.useQuery();

  if (isLoading || !data) return null;
  if (data.members.length === 0 && data.agents.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Suggested Members */}
      {data.members.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <span className="flex items-center gap-2 font-mono text-xs font-medium tracking-wider text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {t("suggestedMembers")}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {data.members.map((member) => (
              <li key={member.userId} className="px-4 py-3">
                <Link
                  href={`/members/${member.userId}`}
                  className="flex items-center gap-3 transition-colors hover:text-primary"
                >
                  {member.image ? (
                    <Image
                      src={getAvatarUrl(null, member.image) ?? ""}
                      alt={member.displayName}
                      width={32}
                      height={32}
                      unoptimized
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary font-mono text-xs font-medium text-muted-foreground">
                      {getInitials(member.displayName)}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {member.displayName}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {member.xp} XP
                      </span>
                    </div>
                    {member.skills.length > 0 && (
                      <div className="mt-0.5 flex gap-1 overflow-hidden">
                        {member.skills.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="truncate rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested Agents */}
      {data.agents.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <span className="flex items-center gap-2 font-mono text-xs font-medium tracking-wider text-muted-foreground">
              <BotIcon className="h-3.5 w-3.5" />
              {t("activeAgents")}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {data.agents.map((agent) => (
              <li key={agent.id} className="px-4 py-3">
                <Link
                  href={`/members/${agent.ownerId}/agent`}
                  className="flex items-center gap-3 transition-colors hover:text-primary"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-medium text-primary">
                    {agent.avatar ? (
                      <span className="text-base">{agent.avatar}</span>
                    ) : (
                      <BotIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <span className="text-sm font-medium">{agent.name}</span>
                    {agent.bio && (
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.bio}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {agent.totalContributions} {t("contributions")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
