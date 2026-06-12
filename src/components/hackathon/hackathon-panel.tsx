"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamLeaderboard } from "./team-leaderboard";
import { TeamGridProgress } from "./team-grid-progress";
import { matchesSkillFilter } from "@/server/hackathon/looking-for-team";

export function HackathonPanel({
  challengeId,
  eventSlug,
}: {
  challengeId: number;
  eventSlug: string;
}) {
  const t = useTranslations("hackathon");
  const utils = api.useUtils();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;

  const { data: myTeam } = api.hackathon.myTeam.useQuery(
    { challengeId },
    { enabled: userId !== null },
  );

  const { data: lookingList } = api.hackathon.lookingForTeamList.useQuery(
    { challengeId },
    // staleTime: the list is a 5-round-trip query; don't refetch it on every
    // window focus. Mutations invalidate it explicitly.
    { enabled: userId !== null, staleTime: 30_000 },
  );

  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [artifactSummary, setArtifactSummary] = useState("");
  const [skillFilter, setSkillFilter] = useState("");

  const invalidate = () => {
    void utils.hackathon.myTeam.invalidate({ challengeId });
    void utils.hackathon.lookingForTeamList.invalidate({ challengeId });
  };

  const createTeam = api.teams.createTeam.useMutation({
    onSuccess: () => {
      toast.success(t("createTeam"));
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const joinTeam = api.teams.joinTeam.useMutation({
    onSuccess: () => {
      toast.success(t("join"));
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const leaveTeam = api.teams.leaveTeam.useMutation({
    onSuccess: () => {
      toast.success(t("leave"));
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const disbandTeam = api.teams.disbandTeam.useMutation({
    onSuccess: () => {
      toast.success(t("disband"));
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const submitTeam = api.teams.submitTeam.useMutation({
    onSuccess: () => {
      toast.success(t("submitted"));
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const setLookingForTeam = api.hackathon.setLookingForTeam.useMutation({
    onSuccess: () =>
      void utils.hackathon.lookingForTeamList.invalidate({ challengeId }),
    onError: (e) => toast.error(e.message),
  });

  const candidates = (lookingList?.candidates ?? []).filter((c) =>
    matchesSkillFilter(c.skills, skillFilter),
  );
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      {userId && !myTeam ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-medium">{t("createTeam")}</h3>
            <Input
              className="mt-2"
              placeholder={t("teamName")}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <Button
              className="mt-2 w-full"
              disabled={createTeam.isPending || !teamName.trim()}
              onClick={() =>
                createTeam.mutate({ challengeId, name: teamName.trim() })
              }
            >
              {t("create")}
            </Button>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-medium">{t("joinTeam")}</h3>
            <Input
              className="mt-2"
              placeholder={t("joinCode")}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <Button
              className="mt-2 w-full"
              variant="secondary"
              disabled={joinTeam.isPending || !joinCode.trim()}
              onClick={() => joinTeam.mutate({ joinCode: joinCode.trim() })}
            >
              {t("join")}
            </Button>
          </Card>
        </div>
      ) : null}

      {/* "Looking for a team" opt-in (#164): solo-enrolled, forming phase only. */}
      {userId && !myTeam && lookingList?.open && lookingList.viewer.solo ? (
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
      {userId && lookingList?.open && lookingList.viewer.enrolled ? (
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
      ) : null}

      {userId && myTeam ? (
        <Card className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{myTeam.team.name}</h3>
            {myTeam.team.submittedAt ? (
              <Badge variant="secondary">{t("submitted")}</Badge>
            ) : myTeam.team.status === "locked" ? (
              <Badge variant="outline">{t("rosterLocked")}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("members")}:{" "}
            {myTeam.members.map((m) => m.displayName).join(", ")}
          </p>
          {myTeam.isCaptain && myTeam.team.status === "forming" ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-muted-foreground font-mono text-xs">
                {t("joinCode")}: {myTeam.team.joinCode}
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={disbandTeam.isPending}
                onClick={() => disbandTeam.mutate({ teamId: myTeam.team.id })}
              >
                {t("disband")}
              </Button>
            </div>
          ) : null}

          <TeamGridProgress teamId={myTeam.team.id} />

          <Button asChild className="mt-3" size="sm" variant="secondary">
            <Link href={`/events/${eventSlug}/team`}>
              {t("enterWorkspace")} →
            </Link>
          </Button>

          {!myTeam.isCaptain && myTeam.team.status === "forming" ? (
            <Button
              className="mt-3"
              variant="ghost"
              size="sm"
              disabled={leaveTeam.isPending}
              onClick={() => leaveTeam.mutate({ teamId: myTeam.team.id })}
            >
              {t("leave")}
            </Button>
          ) : null}

          {myTeam.isCaptain &&
          myTeam.team.status === "locked" &&
          !myTeam.team.submittedAt ? (
            <div className="mt-3 space-y-2">
              <Input
                placeholder={t("artifactUrl")}
                value={artifactUrl}
                onChange={(e) => setArtifactUrl(e.target.value)}
              />
              <Textarea
                placeholder={t("artifactSummary")}
                value={artifactSummary}
                onChange={(e) => setArtifactSummary(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={submitTeam.isPending}
                onClick={() =>
                  submitTeam.mutate({
                    teamId: myTeam.team.id,
                    artifactUrl: artifactUrl.trim() || undefined,
                    artifactSummary: artifactSummary.trim() || undefined,
                  })
                }
              >
                {t("submit")}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <TeamLeaderboard challengeId={challengeId} eventSlug={eventSlug} />
    </section>
  );
}
