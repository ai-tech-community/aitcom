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

  const { data: lookingList } = api.hackathon.lookingForTeamList.useQuery(
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

  // Nothing to show until the window is open and the viewer is enrolled —
  // matches the old panel's gating; renders nothing at lock+ / for outsiders.
  if (!lookingList?.open || !lookingList.viewer.enrolled) return null;

  const candidates = (lookingList.candidates ?? []).filter((c) =>
    matchesSkillFilter(c.skills, skillFilter),
  );

  return (
    <section>
      <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
        / {t("matchmaking").toUpperCase()}
      </h2>

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
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
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
          <p className="text-muted-foreground mt-3 text-xs">
            {skillFilter.trim()
              ? t("noCandidatesForSkill")
              : t("noCandidates")}
          </p>
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
