import { getTranslations } from "next-intl/server";

import type { HackathonPhase } from "@/server/hackathon/phase";
import { cn } from "@/lib/utils";

const ORDER: HackathonPhase[] = [
  "draft",
  "live",
  "locked",
  "judging",
  "finalized",
];
const LABEL_KEY: Record<HackathonPhase, string> = {
  draft: "statusDraft",
  live: "statusLive",
  locked: "statusLocked",
  judging: "statusJudging",
  finalized: "statusFinalized",
};

/**
 * Linear phase tracker (draft → live → locked → finalized) shown in the manage
 * header. Server component: reads i18n labels and highlights the current phase
 * and everything before it (phases only ever move forward, see hackathonPhase).
 */
export async function ManagePhaseTracker({ phase }: { phase: HackathonPhase }) {
  const t = await getTranslations("hackathon");
  const currentIndex = ORDER.indexOf(phase);

  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {ORDER.map((p, i) => {
        const reached = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <li key={p} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium",
                isCurrent
                  ? "bg-foreground text-background"
                  : reached
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {t(LABEL_KEY[p])}
            </span>
            {i < ORDER.length - 1 ? (
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
