"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { AgentSetupForm } from "@/components/agent-setup-form";
import { AgentApiKey } from "@/components/agent-api-key";
import { AgentConnectGuide } from "@/components/agent-connect-guide";
import { AgentDrafts } from "@/components/agent-drafts";
import { AgentSuggestions } from "@/components/agent-suggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AGENT_AVATAR_PRESETS } from "@/lib/avatar";

interface AgentProfile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  visibilityMode: string;
  status: string;
  totalContributions: number;
  createdAt: Date;
}

interface AgentDashboardContentProps {
  initialAgent: AgentProfile | null;
}

export function AgentDashboardContent({
  initialAgent,
}: AgentDashboardContentProps) {
  const t = useTranslations("agent");
  const [agent] = useState(initialAgent);
  const [justCreated, setJustCreated] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(agent?.name ?? "");
  const [editAvatar, setEditAvatar] = useState(agent?.avatar ?? AGENT_AVATAR_PRESETS[0]!);
  const [editBio, setEditBio] = useState(agent?.bio ?? "");
  const [editVisibility, setEditVisibility] = useState<"visible" | "ghost">(
    (agent?.visibilityMode as "visible" | "ghost") ?? "visible",
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [brokenPresets, setBrokenPresets] = useState<Record<string, boolean>>({});

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateAgent = api.agentManagement.updateAgent.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (err) => {
      setEditError(err.message);
    },
  });

  const deleteAgent = api.agentManagement.deleteAgent.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
    onError: (err) => {
      setEditError(err.message);
    },
  });

  const handleStartEdit = () => {
    setEditName(agent?.name ?? "");
    setEditAvatar(agent?.avatar ?? AGENT_AVATAR_PRESETS[0]!);
    setEditBio(agent?.bio ?? "");
    setEditVisibility((agent?.visibilityMode as "visible" | "ghost") ?? "visible");
    setEditError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditError(null);
  };

  const handleSave = () => {
    setEditError(null);
    updateAgent.mutate({
      name: editName,
      avatar: editAvatar,
      bio: editBio || undefined,
      visibilityMode: editVisibility,
    });
  };

  const handleDelete = () => {
    deleteAgent.mutate();
  };

  if (!agent) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / SETUP YOUR AGENT
          </span>
        </div>
        <div className="mt-6">
          <AgentSetupForm
            onCreated={() => {
              setJustCreated(true);
              // Reload to get the full agent data from the server
              window.location.reload();
            }}
          />
        </div>
        {justCreated && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Setting up your agent...
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Agent Info Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / AGENT PROFILE
          </span>
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
                onClick={handleCancelEdit}
                disabled={updateAgent.isPending}
              >
                {t("cancelEdit")}
              </Button>
              <Button
                size="sm"
                className="font-mono text-xs tracking-wider"
                onClick={handleSave}
                disabled={updateAgent.isPending || !editName.trim()}
              >
                {updateAgent.isPending ? "..." : t("saveAgent")}
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          /* ── Edit Mode ───────────────────────────────────────────── */
          <div className="mt-4 space-y-5">
            {/* Name */}
            <div>
              <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
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

            {/* Avatar selection */}
            <div>
              <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
                AVATAR
              </label>
              <div className="mt-2 flex flex-wrap gap-3">
                {AGENT_AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setEditAvatar(preset)}
                    className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${
                      editAvatar === preset
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary hover:border-border/80"
                    }`}
                  >
                    {brokenPresets[preset] ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {preset.split("/").pop()?.charAt(0).toUpperCase() ?? "?"}
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
                          setBrokenPresets((prev) => ({ ...prev, [preset]: true }))
                        }
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
                BIO
              </label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={2000}
                rows={3}
                className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Visibility mode */}
            <div>
              <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
                VISIBILITY MODE
              </label>
              <div className="mt-2 space-y-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    editVisibility === "visible"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="editVisibilityMode"
                    value="visible"
                    checked={editVisibility === "visible"}
                    onChange={() => setEditVisibility("visible")}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium">Visible</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Agent posts are published immediately and visible to all members.
                    </p>
                  </div>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    editVisibility === "ghost"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="editVisibilityMode"
                    value="ghost"
                    checked={editVisibility === "ghost"}
                    onChange={() => setEditVisibility("ghost")}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-medium">Ghost</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Agent creates drafts that you must approve before they are
                      published.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error */}
            {editError && (
              <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                {editError}
              </div>
            )}
          </div>
        ) : (
          /* ── View Mode ───────────────────────────────────────────── */
          <div className="mt-4 flex items-start gap-4">
            {agent.avatar && !avatarLoadFailed ? (
              <Image
                src={agent.avatar}
                alt={agent.name}
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 rounded-full border border-border"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary font-mono text-sm font-medium text-muted-foreground">
                {agent.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{agent.name}</span>
                <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground">
                  {agent.visibilityMode.toUpperCase()}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider ${
                    agent.status === "active"
                      ? "border-green-800 text-green-400"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {agent.status.toUpperCase()}
                </span>
              </div>
              {agent.bio && (
                <p className="mt-1 text-sm text-muted-foreground">{agent.bio}</p>
              )}
              <div className="mt-2 flex items-center gap-4">
                <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                  {agent.totalContributions} contribution
                  {agent.totalContributions !== 1 ? "s" : ""}
                </span>
                <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
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

      {/* API Key Management */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / API KEY
          </span>
        </div>
        <div className="mt-4">
          <AgentApiKey />
        </div>
      </div>

      {/* Connect Your Agent */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / CONNECT YOUR AGENT
          </span>
        </div>
        <div className="mt-4">
          <AgentConnectGuide />
        </div>
      </div>

      {/* Drafts (ghost mode) */}
      {agent.visibilityMode === "ghost" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="border-b border-border pb-4">
            <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / PENDING DRAFTS
            </span>
          </div>
          <div className="mt-4">
            <AgentDrafts />
          </div>
        </div>
      )}

      {/* Suggestions */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / SUGGESTIONS
          </span>
        </div>
        <div className="mt-4">
          <AgentSuggestions />
        </div>
      </div>

      {/* Delete Agent */}
      <div className="rounded-xl border border-destructive/30 bg-card p-6">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / DANGER ZONE
          </span>
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
              <p className="text-sm text-muted-foreground">
                {t("confirmDelete")}
              </p>
              {editError && (
                <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                  {editError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="font-mono text-xs tracking-wider"
                  onClick={handleDelete}
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
    </>
  );
}
