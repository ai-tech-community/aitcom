// src/components/hackathon/briefing/hackathon-briefing.tsx
// Pre-lock "digital opening ceremony" (spec 2026-06-11): what the grid will
// be, how scoring works, agent setup + relevant tool catalog, and where to get
// help — rendered by the team page while no competitive grid exists.
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CatalogGroup } from "@/server/mcp/catalog-meta";
import type { CellTemplate } from "@/server/hackathon/cell-template";
import { ToolCatalogList } from "@/components/agents/tool-catalog-list";
import { ConnectAgentPanel } from "@/components/hackathon/workspace/connect-agent-panel";
import { AgentReadinessChecklist } from "./agent-readiness-checklist";

export async function HackathonBriefing({
  eventSlug,
  challengeId,
  challengeSlug,
  cellTemplate,
  rankingMode,
  xpReward,
  badgeReward,
  members,
  teamName,
  catalogGroups,
}: {
  eventSlug: string;
  challengeId: number;
  challengeSlug: string;
  cellTemplate: CellTemplate;
  rankingMode: "speed" | "thoroughness" | "collaboration";
  xpReward: number;
  badgeReward: string | null;
  members: { userId: string; displayName: string }[];
  teamName: string;
  catalogGroups: CatalogGroup[];
}) {
  const t = await getTranslations("hackathon.briefing");

  const tiebreakKey = {
    speed: "tiebreakSpeed",
    thoroughness: "tiebreakThoroughness",
    collaboration: "tiebreakCollaboration",
  } as const satisfies Record<typeof rankingMode, string>;

  const requiredTaskTypes = [...new Set(cellTemplate.map((c) => c.taskType))];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          {t("subtitle")}
        </p>
      </div>

      {/* 1 — The plan */}
      <Card>
        <CardHeader>
          <CardTitle>{t("planTitle")}</CardTitle>
          <CardDescription>{t("planIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          {cellTemplate.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("planEmpty")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {cellTemplate.map((cell, i) => (
                <li key={i} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="font-mono text-xs font-semibold">
                      {cell.taskType}
                    </code>
                    <span className="text-muted-foreground font-mono text-[10px] uppercase">
                      {t("verifiedBy", { mode: cell.verificationMode })}
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px] uppercase">
                      {t("deadline", { minutes: cell.deadlineMinutes })}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {cell.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <h4 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-widest uppercase">
              / {t("rosterTitle")} — {teamName}
            </h4>
            <p className="mt-1 text-sm">
              {members.map((m) => m.displayName).join(", ")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2 — How you win */}
      <Card>
        <CardHeader>
          <CardTitle>{t("scoringTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{t("scoringBody")}</p>
          <p className="text-muted-foreground">{t(tiebreakKey[rankingMode])}</p>
          {xpReward > 0 ? <p>{t("prizeXp", { xp: xpReward })}</p> : null}
          {badgeReward ? (
            <p>{t("prizeBadge", { badge: badgeReward })}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* 3 — Work with your agent */}
      <Card>
        <CardHeader>
          <CardTitle>{t("agentTitle")}</CardTitle>
          <CardDescription>{t("agentIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("attribution")}</p>
          <AgentReadinessChecklist requiredTaskTypes={requiredTaskTypes} />
          <ConnectAgentPanel challengeId={challengeId} />
          <div>
            <h4 className="text-sm font-semibold">{t("toolsTitle")}</h4>
            <p className="text-muted-foreground text-sm">{t("toolsIntro")}</p>
            <ToolCatalogList groups={catalogGroups} />
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link href="/agents">{t("fullCatalog")}</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 — Get help */}
      <Card>
        <CardHeader>
          <CardTitle>{t("helpTitle")}</CardTitle>
          <CardDescription>{t("helpBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/challenges/${challengeSlug}`}>
              {t("helpChallenge")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/events/${eventSlug}`}>{t("helpEvent")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
