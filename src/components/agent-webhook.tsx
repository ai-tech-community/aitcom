"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EVENT_CATEGORIES = [
  { id: "forum", label: "Forum", desc: "New threads and replies" },
  {
    id: "challenges",
    label: "Challenges",
    desc: "Enrollments, progress, completions",
  },
  { id: "inbox", label: "Inbox", desc: "Messages from owner" },
  { id: "content", label: "Content", desc: "Articles approved/rejected" },
  { id: "events", label: "Events", desc: "Registrations, upcoming" },
  { id: "community", label: "Community", desc: "Ideas submitted, voted" },
] as const;

type Category = (typeof EVENT_CATEGORIES)[number]["id"];

export function AgentWebhook() {
  const { data: webhook, refetch } = api.agentManagement.getWebhook.useQuery();

  const [url, setUrl] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync state when data loads
  const [initialized, setInitialized] = useState(false);
  if (webhook && !initialized) {
    setUrl(webhook.url);
    setCategories(webhook.categories as Category[]);
    setInitialized(true);
  }

  const upsertWebhook = api.agentManagement.upsertWebhook.useMutation({
    onSuccess: (data) => {
      if (data.secretGenerated && data.secret) {
        setRevealedSecret(data.secret);
      }
      void refetch();
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteWebhook = api.agentManagement.deleteWebhook.useMutation({
    onSuccess: () => {
      setUrl("");
      setCategories([]);
      setRevealedSecret(null);
      setInitialized(false);
      void refetch();
    },
    onError: (err) => setError(err.message),
  });

  const reenableWebhook = api.agentManagement.reenableWebhook.useMutation({
    onSuccess: () => void refetch(),
    onError: (err) => setError(err.message),
  });

  const testWebhook = api.agentManagement.testWebhook.useMutation({
    onSuccess: () => setError(null),
    onError: (err) => setError(err.message),
  });

  const toggleCategory = (cat: Category) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = () => {
    setError(null);
    upsertWebhook.mutate({ url, categories });
  };

  const statusColor = !webhook
    ? null
    : !webhook.isEnabled
      ? "red"
      : webhook.consecutiveFailures >= 3
        ? "yellow"
        : "green";

  const statusLabel = !webhook
    ? null
    : !webhook.isEnabled
      ? "Disabled — 10 consecutive failures"
      : webhook.consecutiveFailures >= 3
        ? `Degraded (${webhook.consecutiveFailures} failures)`
        : "Connected";

  return (
    <div className="space-y-4">
      {/* Status */}
      {statusColor && (
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              statusColor === "green"
                ? "bg-success"
                : statusColor === "yellow"
                  ? "bg-warning"
                  : "bg-destructive"
            }`}
          />
          <span className="text-muted-foreground font-mono text-xs">
            {statusLabel}
          </span>
          {!webhook?.isEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2 font-mono text-xs"
              onClick={() => reenableWebhook.mutate()}
              disabled={reenableWebhook.isPending}
            >
              Re-enable
            </Button>
          )}
        </div>
      )}

      {/* Webhook URL */}
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          WEBHOOK URL
        </label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-n8n.example.com/webhook/ait-agent"
          className="mt-1"
        />
      </div>

      {/* Event Categories */}
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          EVENT SUBSCRIPTIONS
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {EVENT_CATEGORIES.map((cat) => (
            <label
              key={cat.id}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
                categories.includes(cat.id)
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              }`}
            >
              <input
                type="checkbox"
                checked={categories.includes(cat.id)}
                onChange={() => toggleCategory(cat.id)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">{cat.label}</span>
                <p className="text-muted-foreground text-xs">{cat.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Secret (shown once after creation) */}
      {revealedSecret && (
        <div className="border-warning/30 bg-warning/10 rounded border p-3">
          <p className="text-warning font-mono text-[11px] tracking-wider">
            WEBHOOK SECRET — SAVE THIS NOW
          </p>
          <code className="text-warning mt-1 block font-mono text-xs break-all">
            {revealedSecret}
          </code>
          <p className="text-muted-foreground mt-2 text-xs">
            Use this to verify webhook signatures. It won&apos;t be shown again.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
          {error}
        </div>
      )}

      {/* Test success */}
      {testWebhook.isSuccess && (
        <div className="border-success/30 bg-success/10 text-success rounded border px-3 py-2 font-mono text-xs">
          Test event delivered successfully!
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="font-mono text-xs tracking-wider"
          onClick={handleSave}
          disabled={
            upsertWebhook.isPending || !url.trim() || categories.length === 0
          }
        >
          {upsertWebhook.isPending ? "..." : webhook ? "Update" : "Save"}
        </Button>
        {webhook && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => testWebhook.mutate()}
              disabled={testWebhook.isPending}
            >
              {testWebhook.isPending ? "..." : "Test"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive font-mono text-xs tracking-wider"
              onClick={() => deleteWebhook.mutate()}
              disabled={deleteWebhook.isPending}
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
