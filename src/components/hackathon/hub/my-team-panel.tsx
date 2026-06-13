"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeamGridProgress } from "@/components/hackathon/team-grid-progress";

/**
 * Team-formation + roster UI for the "My Team" hub tab. The server page gates
 * this to enrolled viewers (tab key "team"). Extracted verbatim from the old
 * HackathonPanel — create/join cards when teamless, then the my-team card
 * (roster, captain join code, leave/disband, the captain artifact-submission
 * form, TeamGridProgress) plus the workspace link.
 */
export function MyTeamPanel({
  challengeId,
  eventSlug,
}: {
  challengeId: number;
  eventSlug: string;
}) {
  const t = useTranslations("hackathon");
  const utils = api.useUtils();

  const { data: myTeam } = api.hackathon.myTeam.useQuery({ challengeId });

  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [artifactSummary, setArtifactSummary] = useState("");

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

  return (
    <section>
      <h2 className="text-lg font-semibold">{t("tabTeam")}</h2>

      {!myTeam ? (
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

      {myTeam ? (
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
            <Link href={`/events/${eventSlug}/workspace`}>
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
    </section>
  );
}
