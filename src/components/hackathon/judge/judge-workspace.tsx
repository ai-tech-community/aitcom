"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/trpc/react";

export function JudgeWorkspace({ challengeId }: { challengeId: number }) {
  const teams = api.hackathon.judgeableTeams.useQuery({ challengeId });
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!teams.data) return;
    setRanks(
      Object.fromEntries(
        teams.data.map((t) => [t.teamId, t.myRank ? String(t.myRank) : ""]),
      ),
    );
    setComments(
      Object.fromEntries(teams.data.map((t) => [t.teamId, t.myComment ?? ""])),
    );
  }, [teams.data]);

  const submit = api.hackathon.submitRankings.useMutation({
    onSuccess: () => toast.success("Rankings submitted"),
    onError: (e) => toast.error(e.message),
  });

  if (teams.isLoading || !teams.data) return null;
  if (teams.data.length === 0) return <p>No submitted teams to judge yet.</p>;

  // Mirror the server validation (submitRankings) client-side so the judge gets
  // a clear message instead of an opaque Zod error: every team needs a rank,
  // and the ranks must be the distinct contiguous ordinals 1..N.
  const n = teams.data.length;
  const parsed = teams.data.map((t) => Number(ranks[t.teamId]));
  const allFilled = teams.data.every((t) => (ranks[t.teamId] ?? "") !== "");
  const allValid = parsed.every((r) => Number.isInteger(r) && r >= 1 && r <= n);
  const distinct = new Set(parsed).size === parsed.length;
  const ballotError = !allFilled
    ? "Give every team a rank."
    : !allValid
      ? `Ranks must be whole numbers from 1 to ${n}.`
      : !distinct
        ? "Each rank must be used exactly once."
        : null;

  return (
    <div className="space-y-4">
      {teams.data.map((t) => (
        <div key={t.teamId} className="rounded border p-3">
          <div className="flex items-center justify-between">
            <strong>{t.name}</strong>
            <span className="text-muted-foreground text-sm">
              auto score: {t.score ?? 0}
            </span>
          </div>
          {t.artifactUrl && (
            <a
              className="text-sm text-blue-600"
              href={t.artifactUrl}
              target="_blank"
              rel="noreferrer"
            >
              View artifact
            </a>
          )}
          {t.artifactSummary && <p className="text-sm">{t.artifactSummary}</p>}
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={1}
              className="w-20 border px-2 py-1"
              placeholder="rank"
              value={ranks[t.teamId] ?? ""}
              onChange={(e) =>
                setRanks((r) => ({ ...r, [t.teamId]: e.target.value }))
              }
            />
            <input
              className="flex-1 border px-2 py-1"
              placeholder="comment (optional)"
              value={comments[t.teamId] ?? ""}
              onChange={(e) =>
                setComments((c) => ({ ...c, [t.teamId]: e.target.value }))
              }
            />
          </div>
        </div>
      ))}
      {ballotError && <p className="text-destructive text-sm">{ballotError}</p>}
      <button
        disabled={submit.isPending || ballotError !== null}
        onClick={() =>
          submit.mutate({
            challengeId,
            rankings: teams.data.map((t) => ({
              teamId: t.teamId,
              rank: Number(ranks[t.teamId]),
              comment: comments[t.teamId]?.trim()
                ? comments[t.teamId]
                : undefined,
            })),
          })
        }
      >
        Submit rankings
      </button>
    </div>
  );
}
