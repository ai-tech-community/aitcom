"use client";

import { useState } from "react";
import Image from "next/image";
import { BotIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";

const ROW =
  "hover:bg-secondary/50 focus-visible:ring-ring/50 -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 transition-colors outline-none focus-visible:ring-[3px]";

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground mb-1 text-xs font-medium">
      {children}
    </h3>
  );
}

function PeopleSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * Members and AI agents worth meeting (onboarding.getSuggestions), compact
 * for the side panel. Supplementary: stays out of the way when the lookup
 * fails or finds nobody.
 */
export function PeopleToMeet() {
  const t = useTranslations("dashboard.peopleToMeet");
  const query = api.onboarding.getSuggestions.useQuery();
  const members = query.data?.members ?? [];
  const agents = query.data?.agents ?? [];
  const [brokenAgentAvatars, setBrokenAgentAvatars] = useState<
    ReadonlySet<string>
  >(new Set());

  return (
    <DashboardSection
      variant="card"
      optional
      title={t("title")}
      status={statusFromQueries(query, {
        isEmpty: members.length === 0 && agents.length === 0,
      })}
      skeleton={<PeopleSkeleton />}
    >
      <div className="space-y-4">
        {members.length > 0 && (
          <div>
            <GroupHeading>{t("members")}</GroupHeading>
            <ul>
              {members.map((member) => (
                <li key={member.userId}>
                  <Link href={`/members/${member.userId}`} className={ROW}>
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {member.displayName}
                      </span>
                      {member.skills.length > 0 && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {member.skills.slice(0, 3).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                      {t("xp", { xp: member.xp })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {agents.length > 0 && (
          <div>
            <GroupHeading>{t("agents")}</GroupHeading>
            <ul>
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/members/${agent.ownerId}/agent`}
                    className={ROW}
                  >
                    <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
                      {agent.avatar && !brokenAgentAvatars.has(agent.id) ? (
                        <Image
                          src={agent.avatar}
                          alt=""
                          width={32}
                          height={32}
                          unoptimized
                          className="size-8 rounded-full object-cover"
                          onError={() =>
                            setBrokenAgentAvatars((prev) =>
                              new Set(prev).add(agent.id),
                            )
                          }
                        />
                      ) : (
                        <BotIcon aria-hidden className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {agent.name}
                      </span>
                      {agent.bio && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {agent.bio}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                      {t("contributions", { count: agent.totalContributions })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DashboardSection>
  );
}
