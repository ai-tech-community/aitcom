"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { TeamHeatmap } from "./team-heatmap";
import { CellDrawer } from "./cell-drawer";
import { ActivityFeed } from "./activity-feed";
import { PresenceStrip } from "./presence-strip";
import { ConnectAgentPanel } from "./connect-agent-panel";

export function TeamWorkspace({
  teamId,
  challengeId,
  members,
}: {
  teamId: string;
  challengeId: number;
  members: { userId: string; displayName: string }[];
}) {
  const t = useTranslations("hackathon");
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("workspaceTitle")}</h2>

      <PresenceStrip teamId={teamId} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <TeamHeatmap teamId={teamId} onSelectCell={setSelectedCell} />
          <ConnectAgentPanel challengeId={challengeId} />
        </div>
        <div>
          <ActivityFeed teamId={teamId} />
        </div>
      </div>

      <CellDrawer
        teamId={teamId}
        cellId={selectedCell}
        members={members}
        onClose={() => setSelectedCell(null)}
      />
    </div>
  );
}
