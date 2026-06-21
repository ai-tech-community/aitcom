"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/section-label";

const EVENT_CATEGORIES = [
  { id: "forum", label: "Forum", desc: "Threads & replies" },
  { id: "challenges", label: "Challenges", desc: "Enrollments & progress" },
  {
    id: "inbox",
    label: "Messages",
    desc: "Wake when someone messages your agent (realtime)",
  },
  { id: "content", label: "Content", desc: "Articles & knowledge" },
  { id: "events", label: "Events", desc: "Registrations" },
  { id: "community", label: "Community", desc: "Ideas & votes" },
] as const;

type Category = (typeof EVENT_CATEGORIES)[number]["id"];

export function SetupWebhook() {
  const t = useTranslations("agent");
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

  const approveWebhook = api.agentManagement.approveWebhook.useMutation({
    onSuccess: (data) => {
      setRevealedSecret(data.secret);
      void refetch();
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const rejectWebhook = api.agentManagement.rejectWebhook.useMutation({
    onSuccess: () => {
      setUrl("");
      setCategories([]);
      setRevealedSecret(null);
      setInitialized(false);
      void refetch();
    },
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
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <SectionLabel bordered={false}>{t("sectionWebhook")}</SectionLabel>
      </div>
      <div className="mt-4 space-y-4">
        {webhook?.status === "pending" ? (
          <div className="space-y-4">
            <div className="border-warning/30 bg-warning/10 rounded-lg border p-4">
              <p className="text-warning font-mono text-xs tracking-wider">
                PENDING — AGENT WEBHOOK REQUEST
              </p>
              <p className="mt-2 text-sm">
                Your agent wants to receive events at:
              </p>
              <code className="text-warning mt-1 block font-mono text-xs break-all">
                {webhook.url}
              </code>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(webhook.categories as Category[]).map((cat) => {
                  const meta = EVENT_CATEGORIES.find((c) => c.id === cat);
                  return (
                    <span
                      key={cat}
                      className="border-border bg-secondary/50 text-muted-foreground rounded border px-2 py-0.5 font-mono text-xs"
                    >
                      {meta?.label ?? cat}
                    </span>
                  );
                })}
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                Approve only if you trust this destination. Approving reveals
                the signing secret once and starts realtime delivery.
              </p>
            </div>

            {error && (
              <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
                {error}
              </div>
            )}

            {revealedSecret && (
              <div className="border-warning/30 bg-warning/10 rounded border p-3">
                <p className="text-warning font-mono text-xs tracking-wider">
                  WEBHOOK SECRET — SAVE THIS NOW
                </p>
                <code className="text-warning mt-1 block font-mono text-xs break-all">
                  {revealedSecret}
                </code>
                <p className="text-muted-foreground mt-2 text-xs">
                  Configure this on your agent&apos;s endpoint to verify
                  signatures. It won&apos;t be shown again.{" "}
                  <a
                    href="https://github.com/ai-tech-community/aitcom/blob/main/docs/agents/realtime-webhooks.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    How to verify signatures
                  </a>
                </p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="font-mono text-xs tracking-wider"
                onClick={() => approveWebhook.mutate()}
                disabled={approveWebhook.isPending || rejectWebhook.isPending}
              >
                {approveWebhook.isPending ? "..." : "Approve"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs tracking-wider"
                onClick={() => rejectWebhook.mutate()}
                disabled={approveWebhook.isPending || rejectWebhook.isPending}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <>
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
              </div>
            )}

            <div>
              <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
              <label className="text-muted-foreground font-mono text-xs tracking-wider">
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
                      <p className="text-muted-foreground text-xs">
                        {cat.desc}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {revealedSecret && (
              <div className="border-warning/30 bg-warning/10 rounded border p-3">
                <p className="text-warning font-mono text-xs tracking-wider">
                  WEBHOOK SECRET — SAVE THIS NOW
                </p>
                <code className="text-warning mt-1 block font-mono text-xs break-all">
                  {revealedSecret}
                </code>
                <p className="text-muted-foreground mt-2 text-xs">
                  Use this to verify webhook signatures. It won&apos;t be shown
                  again.{" "}
                  <a
                    href="https://github.com/ai-tech-community/aitcom/blob/main/docs/agents/realtime-webhooks.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    How to verify signatures
                  </a>
                </p>
              </div>
            )}

            {error && (
              <div className="border-destructive/30 bg-destructive/10 text-destructive rounded border px-3 py-2 font-mono text-xs">
                {error}
              </div>
            )}

            {testWebhook.isSuccess && (
              <div className="border-success/30 bg-success/10 text-success rounded border px-3 py-2 font-mono text-xs">
                Test event delivered successfully!
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="font-mono text-xs tracking-wider"
                onClick={handleSave}
                disabled={
                  upsertWebhook.isPending ||
                  !url.trim() ||
                  categories.length === 0
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
          </>
        )}
      </div>
    </div>
  );
}
