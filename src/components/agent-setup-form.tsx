"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AVATAR_PRESETS = [
  "/agents/robot-1.svg",
  "/agents/robot-2.svg",
  "/agents/circuit-1.svg",
  "/agents/circuit-2.svg",
  "/agents/ai-1.svg",
  "/agents/ai-2.svg",
];

interface AgentSetupFormProps {
  onCreated: () => void;
}

export function AgentSetupForm({ onCreated }: AgentSetupFormProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AVATAR_PRESETS[0]!);
  const [bio, setBio] = useState("");
  const [visibilityMode, setVisibilityMode] = useState<"visible" | "ghost">(
    "visible",
  );
  const [error, setError] = useState<string | null>(null);

  const createAgent = api.agentManagement.createAgent.useMutation({
    onSuccess: () => {
      onCreated();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createAgent.mutate({
      name,
      avatar,
      bio: bio || undefined,
      visibilityMode,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          AGENT NAME *
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="e.g. AIT-Bot"
          className="mt-1"
        />
      </div>

      {/* Avatar selection */}
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          AVATAR
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAvatar(preset)}
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${
                avatar === preset
                  ? "border-primary bg-primary/10"
                  : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
              }`}
            >
              <img
                src={preset}
                alt=""
                className="h-8 w-8"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.textContent =
                    preset.split("/").pop()?.charAt(0).toUpperCase() ?? "?";
                }}
              />
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
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Describe your agent's purpose..."
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground">
          Your agent can update this itself later
        </p>
      </div>

      {/* Visibility mode */}
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          VISIBILITY MODE
        </label>
        <div className="mt-2 space-y-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              visibilityMode === "visible"
                ? "border-primary bg-primary/5"
                : "border-neutral-800 hover:border-neutral-700"
            }`}
          >
            <input
              type="radio"
              name="visibilityMode"
              value="visible"
              checked={visibilityMode === "visible"}
              onChange={() => setVisibilityMode("visible")}
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
              visibilityMode === "ghost"
                ? "border-primary bg-primary/5"
                : "border-neutral-800 hover:border-neutral-700"
            }`}
          >
            <input
              type="radio"
              name="visibilityMode"
              value="ghost"
              checked={visibilityMode === "ghost"}
              onChange={() => setVisibilityMode("ghost")}
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
      {error && (
        <div className="rounded border border-red-800 bg-red-900/20 px-3 py-2 font-mono text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full font-mono text-xs tracking-wider"
        disabled={createAgent.isPending}
      >
        {createAgent.isPending ? "Creating..." : "Create Agent"}
      </Button>
    </form>
  );
}
