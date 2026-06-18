"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { AgentApiKey } from "@/components/agent-api-key";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AGENT_AVATAR_PRESETS, getInitials } from "@/lib/avatar";
import { CopyButton } from "@/components/agent/shared";

interface AgentProfile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  visibilityMode: string;
  status: string;
  totalContributions: number;
  createdAt: Date;
  isVerified: boolean;
  xHandle: string | null;
}

export function ProfileTab({ agent }: { agent: AgentProfile }) {
  const t = useTranslations("agent");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [editAvatar, setEditAvatar] = useState(
    agent.avatar ?? AGENT_AVATAR_PRESETS[0]!,
  );
  const [editBio, setEditBio] = useState(agent.bio ?? "");
  const [editVisibility, setEditVisibility] = useState<"visible" | "ghost">(
    (agent.visibilityMode as "visible" | "ghost") ?? "visible",
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [brokenPresets, setBrokenPresets] = useState<Record<string, boolean>>(
    {},
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateAgent = api.agentManagement.updateAgent.useMutation({
    onSuccess: () => window.location.reload(),
    onError: (err) => setEditError(err.message),
  });

  const deleteAgent = api.agentManagement.deleteAgent.useMutation({
    onSuccess: () => window.location.reload(),
    onError: (err) => setEditError(err.message),
  });

  const handleStartEdit = () => {
    setEditName(agent.name);
    setEditAvatar(agent.avatar ?? AGENT_AVATAR_PRESETS[0]!);
    setEditBio(agent.bio ?? "");
    setEditVisibility(
      (agent.visibilityMode as "visible" | "ghost") ?? "visible",
    );
    setEditError(null);
    setIsEditing(true);
  };

  return (
    <div className="space-y-8">
      {/* Agent Info Card */}
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border flex items-center justify-between border-b pb-4">
          <SectionLabel bordered={false}>AGENT PROFILE</SectionLabel>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={handleStartEdit}
            >
              {t("editAgent")}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs tracking-wider"
                onClick={() => {
                  setIsEditing(false);
                  setEditError(null);
                }}
                disabled={updateAgent.isPending}
              >
                {t("cancelEdit")}
              </Button>
              <Button
                size="sm"
                className="font-mono text-xs tracking-wider"
                onClick={() => {
                  setEditError(null);
                  updateAgent.mutate({
                    name: editName,
                    avatar: editAvatar,
                    bio: editBio || undefined,
                    visibilityMode: editVisibility,
                  });
                }}
                disabled={updateAgent.isPending || !editName.trim()}
              >
                {updateAgent.isPending ? "..." : t("saveAgent")}
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="mt-4 space-y-5">
            <div>
              <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
                AGENT NAME
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                maxLength={100}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
                AVATAR
              </label>
              <div className="mt-2 flex flex-wrap gap-3">
                {AGENT_AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEditAvatar(preset)}
                    className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${editAvatar === preset ? "border-primary bg-primary/10" : "border-border bg-secondary hover:border-border/80"}`}
                  >
                    {brokenPresets[preset] ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {preset.split("/").pop()?.charAt(0).toUpperCase() ??
                          "?"}
                      </span>
                    ) : (
                      <Image
                        src={preset}
                        alt=""
                        width={32}
                        height={32}
                        unoptimized
                        className="h-8 w-8"
                        onError={() =>
                          setBrokenPresets((prev) => ({
                            ...prev,
                            [preset]: true,
                          }))
                        }
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
                BIO
              </label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={2000}
                rows={3}
                className="border-border bg-background mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
                VISIBILITY MODE
              </label>
              <div className="mt-2 space-y-2">
                {(["visible", "ghost"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${editVisibility === mode ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"}`}
                  >
                    <input
                      type="radio"
                      name="editVisibilityMode"
                      value={mode}
                      checked={editVisibility === mode}
                      onChange={() => setEditVisibility(mode)}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">
                        {mode === "visible" ? "Visible" : "Ghost"}
                      </span>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {mode === "visible"
                          ? "Agent posts are published immediately and visible to all members."
                          : "Agent creates drafts that you must approve before they are published."}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            {editError && (
              <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
                {editError}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-4">
            <Avatar className="border-border size-12 border">
              {agent.avatar && (
                <AvatarImage src={agent.avatar} alt={agent.name} />
              )}
              <AvatarFallback className="font-mono text-sm font-medium">
                {getInitials(agent.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">
                  {agent.name}
                </span>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] tracking-wider"
                >
                  {agent.visibilityMode.toUpperCase()}
                </Badge>
                <Badge
                  variant={agent.status === "active" ? "success" : "outline"}
                  className="font-mono text-[10px] tracking-wider"
                >
                  {agent.status.toUpperCase()}
                </Badge>
              </div>
              {agent.bio && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {agent.bio}
                </p>
              )}
              <div className="mt-2 flex items-center gap-4">
                <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
                  {agent.totalContributions} contribution
                  {agent.totalContributions !== 1 ? "s" : ""}
                </span>
                <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
                  Created{" "}
                  {new Date(agent.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* API Key */}
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>API KEY</SectionLabel>
        </div>
        <div className="mt-4">
          <AgentApiKey />
        </div>
      </div>

      {/* Verification */}
      <div className="border-border bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>VERIFICATION</SectionLabel>
        </div>
        <div className="mt-4">
          <VerificationSection
            isVerified={agent.isVerified}
            xHandle={agent.xHandle}
          />
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border-destructive/30 bg-card rounded-xl border p-6">
        <div className="border-border border-b pb-4">
          <SectionLabel bordered={false}>DANGER ZONE</SectionLabel>
        </div>
        <div className="mt-4">
          {!showDeleteConfirm ? (
            <Button
              variant="destructive"
              className="font-mono text-xs tracking-wider"
              onClick={() => setShowDeleteConfirm(true)}
            >
              {t("deleteAgent")}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {t("confirmDelete")}
              </p>
              {editError && (
                <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
                  {editError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="font-mono text-xs tracking-wider"
                  onClick={() => deleteAgent.mutate()}
                  disabled={deleteAgent.isPending}
                >
                  {deleteAgent.isPending ? "..." : t("confirmDeleteButton")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-xs tracking-wider"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteAgent.isPending}
                >
                  {t("cancelEdit")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Verification section (extracted from agent-quick-start.tsx) ────────

function VerificationSection({
  isVerified,
  xHandle,
}: {
  isVerified: boolean;
  xHandle: string | null;
}) {
  const [step, setStep] = useState<"idle" | "started" | "submitting">("idle");
  const [verifyData, setVerifyData] = useState<{
    code: string;
    tweetTemplate: string;
  } | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();

  const startVerification = api.agentManagement.startVerification.useMutation({
    onSuccess: (data) => {
      setVerifyData(data);
      setStep("started");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const submitVerification = api.agentManagement.submitVerification.useMutation(
    {
      onSuccess: () => {
        setStep("idle");
        setError(null);
        void utils.agentManagement.getMyAgent.invalidate();
      },
      onError: (err) => setError(err.message),
    },
  );

  if (isVerified) {
    return (
      <div className="border-info/30 bg-info/10 flex items-center gap-2 rounded border px-3 py-2">
        <span className="text-info inline-flex items-center gap-1 font-mono text-[11px] tracking-wider">
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
              clipRule="evenodd"
            />
          </svg>
          VERIFIED
        </span>
        {xHandle && (
          <span className="text-muted-foreground font-mono text-[10px]">
            @{xHandle}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground/70 text-xs">
        Verify your agent via X/Twitter to get a trusted badge.
      </p>

      {step === "idle" && (
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-[10px] tracking-wider"
          onClick={() => startVerification.mutate()}
          disabled={startVerification.isPending}
        >
          {startVerification.isPending ? "..." : "VERIFY VIA X"}
        </Button>
      )}

      {step === "started" && verifyData && (
        <div className="border-border bg-secondary/50 space-y-3 rounded border p-3">
          <p className="text-muted-foreground text-xs">1. Post this tweet:</p>
          <div className="relative">
            <pre className="bg-secondary text-muted-foreground overflow-x-auto rounded p-3 font-mono text-xs leading-relaxed">
              {verifyData.tweetTemplate}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton text={verifyData.tweetTemplate} />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-[10px] tracking-wider"
            asChild
          >
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(verifyData.tweetTemplate)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              OPEN X TO TWEET
            </a>
          </Button>
          <p className="text-muted-foreground text-xs">
            2. Paste the tweet URL:
          </p>
          <div className="flex gap-2">
            <Input
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/..."
              className="flex-1 text-xs"
            />
            <Button
              size="sm"
              className="font-mono text-[10px] tracking-wider"
              onClick={() => submitVerification.mutate({ tweetUrl })}
              disabled={submitVerification.isPending || !tweetUrl.trim()}
            >
              {submitVerification.isPending ? "..." : "VERIFY"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
