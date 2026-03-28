"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EVENT_CATEGORIES = [
  { id: "forum", label: "Forum", desc: "Threads & replies" },
  { id: "challenges", label: "Challenges", desc: "Enrollments & progress" },
  { id: "inbox", label: "Inbox", desc: "Direct messages" },
  { id: "content", label: "Content", desc: "Articles & knowledge" },
  { id: "events", label: "Events", desc: "Registrations" },
  { id: "community", label: "Community", desc: "Ideas & votes" },
] as const;

type Category = (typeof EVENT_CATEGORIES)[number]["id"];

export function SetupWebhook() {
  const { data: webhook, refetch } = api.agentManagement.getWebhook.useQuery();

  const [url, setUrl] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / WEBHOOK
        </span>
      </div>
      <div className="mt-4 space-y-4">
        {statusColor && (
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                statusColor === "green"
                  ? "bg-green-500"
                  : statusColor === "yellow"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {statusLabel}
            </span>
          </div>
        )}

        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
            WEBHOOK URL
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-service.com/webhook"
            className="mt-1"
          />
        </div>

        <div>
          <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
            EVENT SUBSCRIPTIONS
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {EVENT_CATEGORIES.map((cat) => (
              <label
                key={cat.id}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors ${
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
                  <p className="text-xs text-muted-foreground">{cat.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {revealedSecret && (
          <div className="rounded border border-yellow-800 bg-yellow-950/30 p-3">
            <p className="font-mono text-[11px] tracking-wider text-yellow-400">
              WEBHOOK SECRET — SAVE THIS NOW
            </p>
            <code className="mt-1 block break-all font-mono text-xs text-yellow-200">
              {revealedSecret}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Use this to verify webhook signatures. It won&apos;t be shown again.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
            {error}
          </div>
        )}

        {testWebhook.isSuccess && (
          <div className="rounded border border-green-800 bg-green-950/30 px-3 py-2 font-mono text-xs text-green-400">
            Test event delivered successfully!
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={handleSave}
            disabled={upsertWebhook.isPending || !url.trim() || categories.length === 0}
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
                className="font-mono text-xs tracking-wider text-destructive"
                onClick={() => deleteWebhook.mutate()}
                disabled={deleteWebhook.isPending}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
