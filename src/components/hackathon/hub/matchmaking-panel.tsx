"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { matchesSkillFilter } from "@/server/hackathon/looking-for-team";

/**
 * "Find a teammate" matchmaking for the Participants hub tab: the
 * looking-for-team opt-in (solo, forming phase) plus the skill-filterable
 * candidate list (any enrolled participant). Extracted verbatim from the old
 * HackathonPanel. Self-gates via the query's `open` flag — once the window
 * closes (lock+) the query returns open:false and this renders nothing.
 */
export function MatchmakingPanel({ challengeId }: { challengeId: number }) {
  const t = useTranslations("hackathon");
  const utils = api.useUtils();

  const {
    data: lookingList,
    isLoading,
    isError,
    refetch,
  } = api.hackathon.lookingForTeamList.useQuery(
    { challengeId },
    // staleTime: the list is a 5-round-trip query; don't refetch it on every
    // window focus. Mutations invalidate it explicitly.
    { staleTime: 30_000 },
  );

  const [skillFilter, setSkillFilter] = useState("");

  const setLookingForTeam = api.hackathon.setLookingForTeam.useMutation({
    onSuccess: () =>
      void utils.hackathon.lookingForTeamList.invalidate({ challengeId }),
    onError: (e) => toast.error(e.message),
  });

  // While the gating data is still resolving, show a content-shaped skeleton
  // rather than flashing nothing then popping in.
  if (isLoading) {
    return (
      <section>
        <SectionLabel bordered={false}>{t("matchmaking")}</SectionLabel>
        <Card className="mt-4 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-9 w-full" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </Card>
      </section>
    );
  }

  // On an actual fetch error we cannot know whether the viewer is enrolled (the
  // gating flags live in the response we failed to load). This panel is
  // supplementary and self-gates to nothing for outsiders / a closed window, so
  // staying hidden on error preserves that gating — surfacing an error here
  // would leak the panel to outsiders. Hide quietly; the core panels on the
  // page own the visible error surface.
  if (isError) return null;

  // Nothing to show until the window is open and the viewer is enrolled —
  // matches the old panel's gating; renders nothing at lock+ / for outsiders.
  if (!lookingList?.open || !lookingList.viewer.enrolled) return null;

  const candidates = (lookingList.candidates ?? []).filter((c) =>
    matchesSkillFilter(c.skills, skillFilter),
  );

  return (
    <section>
      <SectionLabel bordered={false}>{t("matchmaking")}</SectionLabel>

      {/* "Looking for a team" opt-in (#164): solo-enrolled, forming phase only. */}
      {lookingList.viewer.solo ? (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium">{t("lookingForTeam")}</h3>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("lookingForTeamHint")}
              </p>
              {/* Hidden profiles never surface in the candidate list — warn
                  instead of silently dropping the viewer (#164 review). */}
              {lookingList.viewer.profileHidden ? (
                <p className="text-warning mt-1 text-xs">
                  {t("lookingForTeamHiddenProfile")}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant={
                lookingList.viewer.lookingForTeam ? "secondary" : "default"
              }
              disabled={setLookingForTeam.isPending}
              onClick={() =>
                setLookingForTeam.mutate({
                  challengeId,
                  looking: !lookingList.viewer.lookingForTeam,
                })
              }
            >
              {lookingList.viewer.lookingForTeam
                ? t("lookingForTeamOff")
                : t("lookingForTeamOn")}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Skill-filterable teammate list, visible to enrolled participants. */}
      <Card className="mt-4 p-4">
        <h3 className="text-sm font-medium">{t("lookingForTeamList")}</h3>
        <Input
          className="mt-2"
          placeholder={t("filterBySkill")}
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
        />
        {candidates.length === 0 ? (
          <EmptyState
            className="px-0 py-6"
            title={
              skillFilter.trim() ? t("noCandidatesForSkill") : t("noCandidates")
            }
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {candidates.map((c) => (
              <li
                key={c.userId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{c.displayName}</span>
                  {c.skills.map((skill) => (
                    <Badge key={skill} variant="outline">
                      {skill}
                    </Badge>
                  ))}
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/members/${c.userId}`}>
                    {t("viewProfile")} →
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
