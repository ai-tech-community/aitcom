import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolvePublicHackathonPage } from "@/server/hackathon/resolve-public-hackathon";
import {
  hackathonTimeline,
  type TimelineMilestone,
} from "@/server/hackathon/timeline";
import { EventTimeDisplay } from "@/components/event-time-display";

// Maps each milestone key to its `hackathon` namespace label key. Kept explicit
// so the i18n key set is greppable (rather than string-concatenated).
const LABEL_KEY: Record<TimelineMilestone["key"], string> = {
  registration: "timelineRegistration",
  kickoff: "timelineKickoff",
  lock: "timelineLock",
  submissions: "timelineSubmissions",
  results: "timelineResults",
};

export default async function TimelineTabPage({
  params,
}: {
  params: Promise<{ locale: "en" | "nl"; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations("hackathon");

  const resolved = await resolvePublicHackathonPage(slug, locale);
  if (!resolved.found) notFound();
  const { event, phase } = resolved;

  // Timeline is always available per hubTabStates — no lock gate to wire.
  const milestones = hackathonTimeline(phase);

  return (
    <div className="relative">
      {/* Left rail: a continuous line behind the milestone dots. */}
      <ol className="relative space-y-6 border-l border-border pl-6">
        {milestones.map((milestone) => {
          const isDone = milestone.status === "done";
          const isCurrent = milestone.status === "current";
          return (
            <li key={milestone.key} className="relative">
              {/* Dot, centered on the rail. */}
              <span
                aria-hidden
                className={`absolute -left-[1.6875rem] top-1 h-3 w-3 rounded-full ring-4 ring-background ${
                  isCurrent
                    ? "bg-primary"
                    : isDone
                      ? "bg-foreground/40"
                      : "border border-border bg-background"
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    isCurrent
                      ? "font-semibold text-foreground"
                      : isDone
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                  }
                >
                  {t(LABEL_KEY[milestone.key])}
                </span>
                {isCurrent ? (
                  <span className="bg-primary/15 text-primary rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase">
                    {t("timelineCurrent")}
                  </span>
                ) : null}
              </div>

              {/* Kickoff anchors the event start time (timezone-aware). */}
              {milestone.key === "kickoff" ? (
                <EventTimeDisplay
                  className="mt-1"
                  date={event.date}
                  startTime={event.startTime ?? null}
                  endTime={event.endTime ?? null}
                  timezone={event.timezone ?? null}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
