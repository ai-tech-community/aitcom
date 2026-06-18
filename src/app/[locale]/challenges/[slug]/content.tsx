"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LexicalRenderer } from "@/lib/lexical";
import { ChallengeProgress } from "@/components/challenges/challenge-progress";
import { ChallengeLeaderboard } from "@/components/challenges/challenge-leaderboard";
import { ChallengeChannelView } from "@/components/challenges/challenge-channel-view";
import { GitBranch, Trophy, Award, Gift, Clock, Target } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChallengeObjective {
  description: string;
  verification?: string | null;
  action?: string | null;
  testPattern?: string | null;
  targetCount: number;
  filter?: Record<string, unknown> | null;
}

interface ChallengeDoc {
  id: number;
  title: string;
  slug: string;
  description?: unknown;
  type: string;
  status: string;
  difficulty?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  publishedBy?: string | null;
  creatorId?: string | null;
  repo?: {
    templateUrl?: string | null;
    configFile?: boolean | string | null;
    testCommand?: string | null;
    colabUrl?: string | null;
  } | null;
  objectives: ChallengeObjective[];
  rewards: {
    xpReward: number;
    badgeReward?: string | null;
    sponsorReward?: string | null;
  };
  tags?: string[] | null;
  rankingMode?: string | null;
  maxParticipants?: number | null;
  proposedBy?: string | null;
  image?: unknown;
  collaborationModel?: string | null;
  generatedBy?: string | null;
}

interface HackathonEventRef {
  slug: string;
  title: string;
}

interface ChallengeDetailContentProps {
  challenge: ChallengeDoc;
  hackathonEvent?: HackathonEventRef | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const difficultyColors: Record<string, string> = {
  beginner: "text-green-600",
  intermediate: "text-blue-600",
  advanced: "text-orange-600",
  expert: "text-red-600",
};

const verificationLabels: Record<string, string> = {
  "platform-action": "Platform Action",
  test: "Automated Test",
  "self-report": "Self Report",
  "peer-review": "Peer Review",
};

type Tab = "overview" | "channel" | "progress" | "participants";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChallengeDetailContent({
  challenge,
  hackathonEvent,
}: ChallengeDetailContentProps) {
  const [tab, setTab] = useState<Tab>("overview");

  const utils = api.useUtils();

  const { data: myEnrollments } = api.challenges.getMyEnrollments.useQuery(
    undefined,
    { retry: false },
  );

  const isEnrolled =
    myEnrollments?.some((e) => e.challengeId === challenge.id) ?? false;

  const enroll = api.challenges.enroll.useMutation({
    onSuccess: () => {
      void utils.challenges.getMyEnrollments.invalidate();
      void utils.challenges.getProgress.invalidate({
        challengeId: challenge.id,
      });
    },
  });

  const daysLeft = challenge.endsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(challenge.endsAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  const hasEnded = daysLeft === 0;

  const pillClass = (value: Tab) =>
    `rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors ${
      tab === value
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Hackathon banner — shown when this challenge runs inside an event */}
      {hackathonEvent && (
        <div className="border-border mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
          <span className="text-muted-foreground font-mono text-xs tracking-wider">
            This challenge runs as part of the{" "}
            <span className="text-foreground font-medium">
              {hackathonEvent.title}
            </span>{" "}
            hackathon.
          </span>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
            >
              <Link href={`/events/${hackathonEvent.slug}`}>
                Back to the event
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="font-mono text-xs tracking-wider"
            >
              <Link href={`/events/${hackathonEvent.slug}/team`}>
                Team workspace
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("overview")}
          className={pillClass("overview")}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("channel")}
          className={pillClass("channel")}
        >
          Channel
        </button>
        <button
          onClick={() => setTab("progress")}
          className={pillClass("progress")}
        >
          My Progress
        </button>
        <button
          onClick={() => setTab("participants")}
          className={pillClass("participants")}
        >
          Participants
        </button>
      </div>

      {/* ── Overview Tab ──────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="mt-8">
          {/* Meta line */}
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 font-mono text-xs tracking-wider">
            <span className="uppercase">{challenge.type}</span>
            {challenge.difficulty && (
              <>
                <span className="text-border">|</span>
                <Badge
                  variant="secondary"
                  className={difficultyColors[challenge.difficulty] ?? ""}
                >
                  {challenge.difficulty}
                </Badge>
              </>
            )}
            {challenge.publishedBy === "sponsor" && (
              <>
                <span className="text-border">|</span>
                <Badge variant="outline">Sponsor</Badge>
              </>
            )}
            {challenge.collaborationModel &&
              challenge.collaborationModel !== "solo-ai" && (
                <>
                  <span className="text-border">|</span>
                  <Badge variant="secondary" className="text-purple-600">
                    {challenge.collaborationModel === "relay" && "Relay"}
                    {challenge.collaborationModel === "swarm" && "Swarm"}
                    {challenge.collaborationModel === "adversarial" &&
                      "Adversarial"}
                    {challenge.collaborationModel === "blind" && "Blind"}
                    {challenge.collaborationModel === "escalation" &&
                      "Escalation"}
                  </Badge>
                </>
              )}
            {challenge.generatedBy === "ai" && (
              <>
                <span className="text-border">|</span>
                <span className="text-blue-500">AI Generated</span>
              </>
            )}
            <span className="text-border">|</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {daysLeft === null
                ? "Open-ended"
                : daysLeft > 0
                  ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`
                  : "Ended"}
            </span>
          </div>

          {/* Title */}
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {challenge.title}
          </h1>

          {/* Repo & Colab links */}
          {(challenge.repo?.templateUrl ?? challenge.repo?.colabUrl) && (
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {challenge.repo.templateUrl && (
                <a
                  href={challenge.repo.templateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:opacity-80"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  View Template Repo
                </a>
              )}
              {challenge.repo.colabUrl && (
                <a
                  href={challenge.repo.colabUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:opacity-80"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M16.94 2.634a1.255 1.255 0 0 0-1.078-.57c-.39 0-.78.19-1.078.57L12 6.298 9.198 2.634a1.255 1.255 0 0 0-1.078-.57c-.39 0-.78.19-1.078.57L4.32 6.298C3.5 7.39 3 8.74 3 10.21c0 4.42 4.03 8.01 9 8.01s9-3.59 9-8.01c0-1.47-.5-2.82-1.32-3.912l-2.74-3.664zM12 16.22c-3.87 0-7-2.69-7-6.01 0-1.04.35-2 .95-2.82L8.12 4.5 12 9.7l3.88-5.2 2.17 2.89c.6.82.95 1.78.95 2.82 0 3.32-3.13 6.01-7 6.01z" />
                  </svg>
                  Open in Colab
                </a>
              )}
            </div>
          )}

          {/* Enroll button */}
          <div className="mt-6">
            {!isEnrolled ? (
              <Button
                className="font-mono text-xs tracking-wider"
                onClick={() => enroll.mutate({ challengeId: challenge.id })}
                disabled={enroll.isPending || hasEnded}
              >
                {enroll.isPending ? "Enrolling..." : "Enroll in Challenge"}
              </Button>
            ) : (
              <span className="bg-secondary text-muted-foreground inline-block rounded-full px-4 py-1.5 font-mono text-xs tracking-wider">
                Enrolled
              </span>
            )}
            {enroll.isError && (
              <p className="text-destructive mt-2 font-mono text-xs">
                {enroll.error.message}
              </p>
            )}
          </div>

          {/* Description */}
          {challenge.description ? (
            <div className="border-border mt-8 border-t pt-8">
              <div className="border-border border-b pb-4">
                <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                  / DESCRIPTION
                </h2>
              </div>
              <div className="mt-4">
                <LexicalRenderer content={challenge.description} />
              </div>
            </div>
          ) : null}

          {/* Objectives */}
          {(challenge.objectives ?? []).length > 0 && (
            <div className="border-border mt-8 border-t pt-8">
              <div className="border-border border-b pb-4">
                <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                  / OBJECTIVES
                </h2>
              </div>
              <ol className="mt-4 space-y-3">
                {(challenge.objectives ?? []).map((obj, i) => (
                  <li
                    key={obj.description}
                    className="border-border flex items-start gap-3 rounded border border-dashed px-4 py-3"
                  >
                    <span className="bg-secondary text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Target className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground text-sm font-medium">
                          {obj.description}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        {obj.verification && (
                          <Badge
                            variant="secondary"
                            className="font-mono text-xs"
                          >
                            {verificationLabels[obj.verification] ??
                              obj.verification}
                          </Badge>
                        )}
                        <span className="text-muted-foreground font-mono text-xs">
                          Target: {obj.targetCount}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Rewards */}
          <div className="border-border mt-8 border-t pt-8">
            <div className="border-border border-b pb-4">
              <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                / REWARDS
              </h2>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="font-medium">
                  {challenge.rewards.xpReward} XP
                </span>
              </div>
              {challenge.rewards.badgeReward && (
                <div className="flex items-center gap-2 text-sm">
                  <Award className="h-4 w-4 text-purple-500" />
                  <span>Badge: {challenge.rewards.badgeReward}</span>
                </div>
              )}
              {challenge.rewards.sponsorReward && (
                <div className="flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4 text-pink-500" />
                  <span>{challenge.rewards.sponsorReward}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {challenge.tags && challenge.tags.length > 0 && (
            <div className="border-border mt-8 border-t pt-8">
              <div className="border-border border-b pb-4">
                <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                  / TAGS
                </h2>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {challenge.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-secondary text-muted-foreground rounded-full px-3 py-1 font-mono text-xs tracking-wider"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Channel Tab ───────────────────────────────────────────────── */}
      {tab === "channel" && (
        <ChallengeChannelView
          challengeId={challenge.id}
          isEnrolled={isEnrolled}
        />
      )}

      {/* ── My Progress Tab ───────────────────────────────────────────── */}
      {tab === "progress" && (
        <div className="mt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / MY PROGRESS
            </h2>
          </div>
          <div className="mt-4">
            {isEnrolled ? (
              <ChallengeProgress
                challengeId={challenge.id}
                objectives={(challenge.objectives ?? []).map((o) => ({
                  ...o,
                  verification: o.verification ?? undefined,
                }))}
              />
            ) : (
              <div className="border-border rounded-lg border border-dashed px-6 py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  Enroll first to track progress
                </p>
                <Button
                  className="mt-4 font-mono text-xs tracking-wider"
                  onClick={() => enroll.mutate({ challengeId: challenge.id })}
                  disabled={enroll.isPending || hasEnded}
                >
                  {enroll.isPending ? "Enrolling..." : "Enroll Now"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Participants Tab ──────────────────────────────────────────── */}
      {tab === "participants" && (
        <div className="mt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / PARTICIPANTS
            </h2>
          </div>
          <div className="mt-4">
            <ChallengeLeaderboard challengeId={challenge.id} />
          </div>
        </div>
      )}
    </div>
  );
}
