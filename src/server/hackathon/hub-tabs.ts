// Decides which hub tabs are content-ready vs. show a LockedTabPanel, given the
// viewer's phase and role. Db-free + deterministic so it can be unit-tested and
// shared by the tab bar and each tab page. "available: false" means render the
// locked panel keyed by lockedReasonKey (an i18n key under the `hackathon`
// namespace); the tab itself stays visible and clickable (TAIKAI-style).

import type { HackathonPhase } from "@/server/hackathon/phase";

export type HubTabKey =
  | "overview"
  | "timeline"
  | "projects"
  | "participants"
  | "team"
  | "workspace"
  | "agents"
  | "winners";

export const HUB_TAB_ORDER: HubTabKey[] = [
  "overview",
  "timeline",
  "projects",
  "participants",
  "team",
  "workspace",
  "agents",
  "winners",
];

export interface HubViewerContext {
  phase: HackathonPhase;
  isEnrolled: boolean;
  isOnLockedTeam: boolean;
}

export interface HubTabState {
  key: HubTabKey;
  available: boolean;
  lockedReasonKey: string | null;
}

function decide(key: HubTabKey, ctx: HubViewerContext): HubTabState {
  const open = (): HubTabState => ({
    key,
    available: true,
    lockedReasonKey: null,
  });
  const lock = (reason: string): HubTabState => ({
    key,
    available: false,
    lockedReasonKey: reason,
  });

  switch (key) {
    case "overview":
    case "timeline":
    case "participants":
    case "agents":
      return open();
    case "projects":
      return ctx.phase === "live" ? lock("lockedProjectsPreLock") : open();
    case "team":
      return ctx.isEnrolled ? open() : lock("lockedTeamNotEnrolled");
    case "workspace":
      return ctx.isOnLockedTeam ? open() : lock("lockedWorkspaceNotReady");
    case "winners":
      return ctx.phase === "finalized" ? open() : lock("lockedWinnersPending");
  }
}

export function hubTabStates(ctx: HubViewerContext): HubTabState[] {
  return HUB_TAB_ORDER.map((key) => decide(key, ctx));
}
