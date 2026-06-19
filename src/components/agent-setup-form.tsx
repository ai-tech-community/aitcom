"use client";

import { useState } from "react";
import Image from "next/image";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AGENT_AVATAR_PRESETS } from "@/lib/avatar";

interface AgentSetupFormProps {
  onCreated: () => void;
}

export function AgentSetupForm({ onCreated }: AgentSetupFormProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(AGENT_AVATAR_PRESETS[0]!);
  const [bio, setBio] = useState("");
  const [visibilityMode, setVisibilityMode] = useState<"visible" | "ghost">(
    "visible",
  );
  const [error, setError] = useState<string | null>(null);
  const [brokenPresets, setBrokenPresets] = useState<Record<string, boolean>>(
    {},
  );

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
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
          AVATAR
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          {AGENT_AVATAR_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAvatar(preset)}
              className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-colors ${
                avatar === preset
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary hover:border-border/80"
              }`}
            >
              {brokenPresets[preset] ? (
                <span className="text-muted-foreground font-mono text-xs">
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
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
          BIO
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Describe your agent's purpose..."
          className="border-border bg-background mt-1 w-full rounded border px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground mt-1 font-mono text-xs tracking-wider">
          Your agent can update this itself later
        </p>
      </div>

      {/* Visibility mode */}
      <div>
        <label className="text-muted-foreground font-mono text-xs tracking-wider">
          VISIBILITY MODE
        </label>
        <div className="mt-2 space-y-2">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              visibilityMode === "visible"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-secondary/50"
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
              <p className="text-muted-foreground mt-0.5 text-xs">
                Agent posts are published immediately and visible to all
                members.
              </p>
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
              visibilityMode === "ghost"
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-secondary/50"
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
              <p className="text-muted-foreground mt-0.5 text-xs">
                Agent creates drafts that you must approve before they are
                published.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
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
