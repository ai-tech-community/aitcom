"use client";

import { useState, useCallback } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

// --- Types ---

type ChallengeType = "weekly" | "monthly" | "open-ended";
type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";
type Verification = "platform-action" | "test" | "self-report" | "peer-review";
type RankingMode = "speed" | "thoroughness" | "collaboration";

interface Objective {
  description: string;
  verification: Verification;
  action: string;
  testPattern: string;
  targetCount: number;
}

interface SponsorChallengeFormProps {
  onCancel: () => void;
  onCreated: () => void;
}

// --- Helpers ---

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const TYPES: { value: ChallengeType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "open-ended", label: "Open-Ended" },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

const RANKING_MODES: { value: RankingMode; label: string }[] = [
  { value: "speed", label: "Speed" },
  { value: "thoroughness", label: "Thoroughness" },
  { value: "collaboration", label: "Collaboration" },
];

const VERIFICATION_OPTIONS: { value: Verification; label: string }[] = [
  { value: "platform-action", label: "Platform Action" },
  { value: "test", label: "Test" },
  { value: "self-report", label: "Self-Report" },
  { value: "peer-review", label: "Peer Review" },
];

function emptyObjective(): Objective {
  return {
    description: "",
    verification: "self-report",
    action: "",
    testPattern: "",
    targetCount: 1,
  };
}

// --- Component ---

export function SponsorChallengeForm({
  onCancel,
  onCreated,
}: SponsorChallengeFormProps) {
  const utils = api.useUtils();

  // Basic info
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ChallengeType>("weekly");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");

  // Schedule
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Repository
  const [showRepo, setShowRepo] = useState(false);
  const [repoTemplateUrl, setRepoTemplateUrl] = useState("");
  const [repoTestCommand, setRepoTestCommand] = useState("");
  const [repoConfigFile, setRepoConfigFile] = useState(false);
  const [repoColabUrl, setRepoColabUrl] = useState("");

  // Objectives
  const [objectives, setObjectives] = useState<Objective[]>([emptyObjective()]);

  // Rewards (XP is auto-calculated by the platform based on difficulty + objectives)
  const [badgeReward, setBadgeReward] = useState("");
  const [sponsorReward, setSponsorReward] = useState("");

  // Settings
  const [maxParticipants, setMaxParticipants] = useState(0);
  const [tagsInput, setTagsInput] = useState("");
  const [rankingMode, setRankingMode] = useState<RankingMode>("speed");

  // Error
  const [error, setError] = useState<string | null>(null);

  const createMutation = api.challenges.create.useMutation({
    onSuccess: () => {
      void utils.challenges.list.invalidate();
      onCreated();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (!slugManuallyEdited) {
        setSlug(toKebabCase(value));
      }
    },
    [slugManuallyEdited],
  );

  const handleSlugChange = useCallback((value: string) => {
    setSlugManuallyEdited(true);
    setSlug(value);
  }, []);

  const updateObjective = useCallback(
    (index: number, updates: Partial<Objective>) => {
      setObjectives((prev) =>
        prev.map((obj, i) => (i === index ? { ...obj, ...updates } : obj)),
      );
    },
    [],
  );

  const addObjective = useCallback(() => {
    setObjectives((prev) =>
      prev.length < 10 ? [...prev, emptyObjective()] : prev,
    );
  }, []);

  const removeObjective = useCallback((index: number) => {
    setObjectives((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      createMutation.mutate({
        title,
        slug,
        description,
        type,
        difficulty,
        ...(type !== "open-ended" && startsAt ? { startsAt } : {}),
        ...(type !== "open-ended" && endsAt ? { endsAt } : {}),
        ...(showRepo && repoTemplateUrl ? { repoTemplateUrl } : {}),
        ...(showRepo && repoTestCommand ? { repoTestCommand } : {}),
        ...(showRepo ? { repoConfigFile } : {}),
        ...(showRepo && repoColabUrl ? { repoColabUrl } : {}),
        objectives: objectives.map((obj) => ({
          description: obj.description,
          verification: obj.verification,
          targetCount: obj.targetCount,
          ...(obj.verification === "platform-action" && obj.action
            ? { action: obj.action }
            : {}),
          ...(obj.verification === "test" && obj.testPattern
            ? { testPattern: obj.testPattern }
            : {}),
        })),
        ...(badgeReward ? { badgeReward } : {}),
        ...(sponsorReward ? { sponsorReward } : {}),
        maxParticipants,
        ...(tags.length > 0 ? { tags } : {}),
        rankingMode,
      });
    },
    [
      title,
      slug,
      description,
      type,
      difficulty,
      startsAt,
      endsAt,
      showRepo,
      repoTemplateUrl,
      repoTestCommand,
      repoConfigFile,
      repoColabUrl,
      objectives,
      badgeReward,
      sponsorReward,
      maxParticipants,
      tagsInput,
      rankingMode,
      createMutation,
    ],
  );

  const pillClass = (active: boolean) =>
    `rounded-full px-3 py-1 font-mono text-xs tracking-wider transition-colors cursor-pointer ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-border p-6 space-y-6">
        {/* Header */}
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / CREATE CHALLENGE
          </span>
        </div>

        <p className="text-sm text-muted-foreground">
          Challenge will be created as Draft and needs admin approval.
        </p>

        {/* A. Basic Info */}
        <section className="space-y-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / BASIC INFO
          </span>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Title *
            </label>
            <Input
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Challenge title"
              required
              minLength={3}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Slug *
            </label>
            <Input
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="challenge-slug"
              required
              minLength={3}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Description *
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the challenge..."
              required
              minLength={10}
              maxLength={5000}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Type
            </label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={pillClass(type === t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Difficulty
            </label>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDifficulty(d.value)}
                  className={pillClass(difficulty === d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* B. Schedule (only for weekly/monthly) */}
        {type !== "open-ended" && (
          <section className="space-y-4">
            <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / SCHEDULE
            </span>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="font-mono text-xs tracking-wider text-muted-foreground">
                  Starts At
                </label>
                <Input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs tracking-wider text-muted-foreground">
                  Ends At
                </label>
                <Input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
          </section>
        )}

        {/* C. Repository (collapsible) */}
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setShowRepo(!showRepo)}
            className="flex items-center gap-2 font-mono text-xs font-medium tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRepo ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            / REPOSITORY (OPTIONAL)
          </button>

          {showRepo && (
            <div className="space-y-4 pl-5">
              <div className="space-y-2">
                <label className="font-mono text-xs tracking-wider text-muted-foreground">
                  Template URL
                </label>
                <Input
                  value={repoTemplateUrl}
                  onChange={(e) => setRepoTemplateUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  type="url"
                />
              </div>

              <div className="space-y-2">
                <label className="font-mono text-xs tracking-wider text-muted-foreground">
                  Test Command
                </label>
                <Input
                  value={repoTestCommand}
                  onChange={(e) => setRepoTestCommand(e.target.value)}
                  placeholder="npm test"
                />
              </div>

              <div className="space-y-2">
                <label className="font-mono text-xs tracking-wider text-muted-foreground">
                  Google Colab URL
                </label>
                <Input
                  value={repoColabUrl}
                  onChange={(e) => setRepoColabUrl(e.target.value)}
                  placeholder="https://colab.research.google.com/..."
                  type="url"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repoConfigFile}
                  onChange={(e) => setRepoConfigFile(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="font-mono text-xs tracking-wider text-muted-foreground">
                  Config File
                </span>
              </label>
            </div>
          )}
        </section>

        {/* D. Objectives */}
        <section className="space-y-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / OBJECTIVES
          </span>

          <div className="space-y-4">
            {objectives.map((obj, index) => (
              <div
                key={obj.description || `objective-${index}`}
                className="rounded-lg border border-border p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-wider text-muted-foreground">
                    Objective {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeObjective(index)}
                    disabled={objectives.length <= 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="font-mono text-xs tracking-wider text-muted-foreground">
                    Description *
                  </label>
                  <Input
                    value={obj.description}
                    onChange={(e) =>
                      updateObjective(index, { description: e.target.value })
                    }
                    placeholder="Objective description"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="font-mono text-xs tracking-wider text-muted-foreground">
                      Verification
                    </label>
                    <Select
                      value={obj.verification}
                      onValueChange={(val: Verification) =>
                        updateObjective(index, { verification: val })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VERIFICATION_OPTIONS.map((v) => (
                          <SelectItem key={v.value} value={v.value}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-xs tracking-wider text-muted-foreground">
                      Target Count
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={obj.targetCount}
                      onChange={(e) =>
                        updateObjective(index, {
                          targetCount: parseInt(e.target.value) || 1,
                        })
                      }
                    />
                  </div>
                </div>

                {obj.verification === "platform-action" && (
                  <div className="space-y-2">
                    <label className="font-mono text-xs tracking-wider text-muted-foreground">
                      Action
                    </label>
                    <Select
                      value={obj.action}
                      onValueChange={(val: string) =>
                        updateObjective(index, { action: val })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select action..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="thread.reply">Reply to thread</SelectItem>
                        <SelectItem value="thread.create">Create thread</SelectItem>
                        <SelectItem value="knowledge.share">Share knowledge</SelectItem>
                        <SelectItem value="idea.submitted">Submit idea</SelectItem>
                        <SelectItem value="idea.voted">Vote on idea</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {obj.verification === "test" && (
                  <div className="space-y-2">
                    <label className="font-mono text-xs tracking-wider text-muted-foreground">
                      Test Pattern
                    </label>
                    <Input
                      value={obj.testPattern}
                      onChange={(e) =>
                        updateObjective(index, { testPattern: e.target.value })
                      }
                      placeholder="e.g. test/**/*.spec.ts"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addObjective}
            disabled={objectives.length >= 10}
            className="font-mono text-xs tracking-wider"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Objective
          </Button>
        </section>

        {/* E. Rewards */}
        <section className="space-y-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / REWARDS
          </span>

          <p className="text-xs text-muted-foreground">
            XP is auto-calculated based on difficulty and objective verification modes.
          </p>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Badge Reward
            </label>
            <Input
              value={badgeReward}
              onChange={(e) => setBadgeReward(e.target.value)}
              placeholder="badge slug"
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Sponsor Reward
            </label>
            <Textarea
              value={sponsorReward}
              onChange={(e) => setSponsorReward(e.target.value)}
              placeholder="Description of prizes, interviews, etc."
              rows={2}
            />
          </div>
        </section>

        {/* F. Settings */}
        <section className="space-y-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / SETTINGS
          </span>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="font-mono text-xs tracking-wider text-muted-foreground">
                Max Participants (0 = unlimited)
              </label>
              <Input
                type="number"
                min={0}
                value={maxParticipants}
                onChange={(e) =>
                  setMaxParticipants(parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-xs tracking-wider text-muted-foreground">
                Tags (comma-separated)
              </label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="react, typescript, testing"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs tracking-wider text-muted-foreground">
              Ranking Mode
            </label>
            <div className="flex flex-wrap gap-2">
              {RANKING_MODES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRankingMode(r.value)}
                  className={pillClass(rankingMode === r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Error display */}
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* G. Actions */}
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="font-mono text-xs tracking-wider"
          >
            {createMutation.isPending ? "Creating..." : "Create Challenge"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={createMutation.isPending}
            className="font-mono text-xs tracking-wider"
          >
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
