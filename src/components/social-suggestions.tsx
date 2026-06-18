"use client";

import { useState } from "react";
import Image from "next/image";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BotIcon, Users } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { SectionLabel } from "@/components/ui/section-label";
import { getAvatarUrl, getInitials } from "@/lib/avatar";

export function SocialSuggestions() {
  const t = useTranslations("onboarding");
  const { data, isLoading } = api.onboarding.getSuggestions.useQuery();
  const [brokenAgentAvatars, setBrokenAgentAvatars] = useState<Set<string>>(
    new Set(),
  );

  if (isLoading || !data) return null;
  if (data.members.length === 0 && data.agents.length === 0) return null;

  return (
    <div className="space-y-6">
      {/* Suggested Members */}
      {data.members.length > 0 && (
        <div className="border-border bg-card rounded-lg border">
          <div className="border-border border-b px-4 py-3">
            <SectionLabel
              bordered={false}
              marker={false}
              className="flex items-center gap-2"
            >
              <Users className="h-3.5 w-3.5" />
              {t("suggestedMembers")}
            </SectionLabel>
          </div>
          <ul className="divide-border divide-y">
            {data.members.map((member) => (
              <li key={member.userId} className="px-4 py-3">
                <Link
                  href={`/members/${member.userId}`}
                  className="hover:text-primary flex items-center gap-3 transition-colors"
                >
                  <Avatar className="size-8">
                    {member.image && (
                      <AvatarImage
                        src={getAvatarUrl(null, member.image) ?? ""}
                        alt=""
                      />
                    )}
                    <AvatarFallback className="font-mono text-xs">
                      {getInitials(member.displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {member.displayName}
                      </span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {member.xp} XP
                      </span>
                    </div>
                    {member.skills.length > 0 && (
                      <div className="mt-0.5 flex gap-1 overflow-hidden">
                        {member.skills.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="bg-secondary text-muted-foreground truncate rounded px-1.5 py-0.5 font-mono text-[10px]"
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
        <div className="border-border bg-card rounded-lg border">
          <div className="border-border border-b px-4 py-3">
            <SectionLabel
              bordered={false}
              marker={false}
              className="flex items-center gap-2"
            >
              <BotIcon className="h-3.5 w-3.5" />
              {t("activeAgents")}
            </SectionLabel>
          </div>
          <ul className="divide-border divide-y">
            {data.agents.map((agent) => (
              <li key={agent.id} className="px-4 py-3">
                <Link
                  href={`/members/${agent.ownerId}/agent`}
                  className="hover:text-primary flex items-center gap-3 transition-colors"
                >
                  <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs font-medium">
                    {agent.avatar && !brokenAgentAvatars.has(agent.id) ? (
                      <Image
                        src={agent.avatar}
                        alt={`${agent.name} avatar`}
                        width={32}
                        height={32}
                        unoptimized
                        className="h-8 w-8 rounded-full object-cover"
                        onError={() =>
                          setBrokenAgentAvatars((prev) => {
                            const next = new Set(prev);
                            next.add(agent.id);
                            return next;
                          })
                        }
                      />
                    ) : (
                      <BotIcon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <span className="text-sm font-medium">{agent.name}</span>
                    {agent.bio && (
                      <p className="text-muted-foreground truncate text-xs">
                        {agent.bio}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-foreground font-mono text-[10px]">
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
