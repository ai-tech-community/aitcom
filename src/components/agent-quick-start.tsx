"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateN8nWorkflow } from "@/lib/n8n-workflow-generator";

type Tool = "n8n" | "claude-cli" | "openclaw" | "webhook" | "custom";

// ── Shared tool picker + connection panels (used by QuickStart AND existing agent view) ──

interface AgentToolConnectProps {
  apiKey: string;
  agentName: string;
}

export function AgentToolConnect({ apiKey, agentName }: AgentToolConnectProps) {
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);

  return (
    <div className="space-y-4">
      {/* Tool Picker */}
      <ToolPickerGrid selectedTool={selectedTool} onSelect={setSelectedTool} />

      {/* Connection Panel */}
      {selectedTool && (
        <div className="space-y-4 rounded-lg border border-border bg-secondary/30 p-4">
          {selectedTool === "n8n" && <N8nPanel apiKey={apiKey} agentName={agentName} />}
          {selectedTool === "claude-cli" && <ClaudeCliPanel apiKey={apiKey} />}
          {selectedTool === "openclaw" && <OpenClawPanel apiKey={apiKey} />}
          {selectedTool === "webhook" && <WebhookPanel />}
          {selectedTool === "custom" && <CustomPanel apiKey={apiKey} />}
          <TestConnectionButton />
        </div>
      )}
    </div>
  );
}

// ── Shared tool picker grid ──────────────────────────────────────────────────

function ToolPickerGrid({
  selectedTool,
  onSelect,
  disabled,
}: {
  selectedTool: Tool | null;
  onSelect: (tool: Tool) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("agent");

  const tools: { key: Tool; label: string; icon: React.ReactNode }[] = [
    { key: "n8n", label: t("toolN8n"), icon: <span className="text-2xl">{"\u26A1"}</span> },
    { key: "claude-cli", label: t("toolClaude"), icon: <Image src="/images/claude-logo.svg" alt="Claude" width={28} height={28} className="h-7 w-7" /> },
    {
      key: "openclaw",
      label: t("toolOpenClaw"),
      icon: <Image src="/images/openclaw-logo.svg" alt="OpenClaw" width={32} height={32} className="h-8 w-8" />,
    },
    { key: "webhook", label: "Webhook", icon: <span className="text-2xl">{"\uD83D\uDD17"}</span> },
    { key: "custom", label: t("toolCustom"), icon: <span className="text-2xl">{"\u2699"}</span> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tools.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          disabled={disabled}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
            selectedTool === key
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-secondary/50"
          } ${disabled ? "opacity-50" : ""}`}
        >
          {icon}
          <span className="font-mono text-xs tracking-wider">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Quick Start (new user flow — creates agent + shows tool connect) ──

interface AgentQuickStartProps {
  onSetupComplete: () => void;
}

export function AgentQuickStart({ onSetupComplete }: AgentQuickStartProps) {
  const t = useTranslations("agent");
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [setupResult, setSetupResult] = useState<{
    agent: { id: string; name: string; avatar: string | null; bio: string | null; visibilityMode: string; status: string };
    apiKey: string;
    keyPrefix: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCustomize, setShowCustomize] = useState(false);

  const quickSetup = api.agentManagement.quickSetup.useMutation({
    onSuccess: (data) => {
      setSetupResult(data);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleToolClick = (tool: Tool) => {
    setSelectedTool(tool);
    setError(null);

    if (!setupResult) {
      quickSetup.mutate({ tool });
    }
  };

  return (
    <div className="space-y-6">
      {/* Tool Picker */}
      <div>
        <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          {t("quickStartSubtitle")}
        </h3>
        <div className="mt-3">
          <ToolPickerGrid
            selectedTool={selectedTool}
            onSelect={handleToolClick}
            disabled={quickSetup.isPending}
          />
        </div>
      </div>

      {/* Loading state */}
      {quickSetup.isPending && (
        <p className="text-center font-mono text-xs tracking-wider text-muted-foreground">
          {t("settingUp")}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Connection Panel */}
      {setupResult && selectedTool && (
        <ConnectionPanel
          tool={selectedTool}
          apiKey={setupResult.apiKey}
          agentName={setupResult.agent.name}
          onDone={onSetupComplete}
        />
      )}

      {/* Customize (collapsed by default) */}
      {setupResult && (
        <div>
          <button
            type="button"
            onClick={() => setShowCustomize(!showCustomize)}
            className="font-mono text-xs tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showCustomize ? "\u25BE" : "\u25B8"} {t("customizeProfile")}
          </button>
          {showCustomize && (
            <AgentCustomizeSection agent={setupResult.agent} />
          )}
        </div>
      )}
    </div>
  );
}

// -- Connection panels -------------------------------------------------------

function ConnectionPanel({
  tool,
  apiKey,
  agentName,
  onDone,
}: {
  tool: Tool;
  apiKey: string;
  agentName: string;
  onDone: () => void;
}) {
  const t = useTranslations("agent");

  return (
    <div className="space-y-4 rounded-lg border border-border bg-secondary/30 p-4">
      {tool === "n8n" && <N8nPanel apiKey={apiKey} agentName={agentName} />}
      {tool === "claude-cli" && <ClaudeCliPanel apiKey={apiKey} />}
      {tool === "openclaw" && <OpenClawPanel apiKey={apiKey} />}
      {tool === "custom" && <CustomPanel apiKey={apiKey} />}

      <TestConnectionButton />

      <p className="text-center">
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs tracking-wider"
          onClick={onDone}
        >
          {t("connectionReady")} →
        </Button>
      </p>
    </div>
  );
}

function N8nPanel({ apiKey, agentName }: { apiKey: string; agentName: string }) {
  const t = useTranslations("agent");
  const [showManual, setShowManual] = useState(false);
  const { data: webhook } = api.agentManagement.getWebhook.useQuery();

  const handleDownload = () => {
    const workflow = generateN8nWorkflow(apiKey, agentName);
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ait-community-workflow.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Download a pre-configured n8n workflow and import it into your n8n instance.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="font-mono text-xs tracking-wider" onClick={handleDownload}>
          {t("downloadWorkflow")}
        </Button>
        <Button variant="outline" size="sm" className="font-mono text-xs tracking-wider" asChild>
          <a href="https://n8n.io/workflows" target="_blank" rel="noopener noreferrer">
            {t("useTemplate")}
          </a>
        </Button>
      </div>

      {/* Webhook registration status */}
      {webhook ? (
        <div className="rounded border border-border bg-secondary/50 p-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                !webhook.isEnabled
                  ? "bg-red-500"
                  : webhook.consecutiveFailures >= 3
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
            />
            <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
              WEBHOOK {webhook.isEnabled ? "REGISTERED" : "DISABLED"}
            </span>
          </div>
          <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">
            {webhook.url}
          </code>
        </div>
      ) : (
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
          Webhook registers automatically when you activate the n8n workflow.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowManual(!showManual)}
        className="font-mono text-[11px] tracking-wider text-muted-foreground hover:text-foreground"
      >
        {showManual ? "\u25BE" : "\u25B8"} {t("manualSetup")}
      </button>
      {showManual && (
        <CodeBlock
          code={`POST https://www.aitcommunity.org/api/mcp\nAuthorization: Bearer ${apiKey}\nContent-Type: application/json`}
        />
      )}
    </div>
  );
}

function WebhookPanel() {
  const { data: webhook, refetch } = api.agentManagement.getWebhook.useQuery();

  const [url, setUrl] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [initialized, setInitialized] = useState(false);
  if (webhook && !initialized) {
    setUrl(webhook.url);
    setCategories(webhook.categories);
    setInitialized(true);
  }

  const upsertWebhook = api.agentManagement.upsertWebhook.useMutation({
    onSuccess: () => {
      void refetch();
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const deleteWebhook = api.agentManagement.deleteWebhook.useMutation({
    onSuccess: () => {
      setUrl("");
      setCategories([]);
      setInitialized(false);
      void refetch();
    },
    onError: (err) => setError(err.message),
  });

  const testWebhook = api.agentManagement.testWebhook.useMutation({
    onSuccess: () => setError(null),
    onError: (err) => setError(err.message),
  });

  const CATS = [
    { id: "forum", label: "Forum", desc: "Threads & replies" },
    { id: "challenges", label: "Challenges", desc: "Enrollments & progress" },
    { id: "inbox", label: "Inbox", desc: "Direct messages" },
    { id: "content", label: "Content", desc: "Articles & knowledge" },
    { id: "events", label: "Events", desc: "Registrations" },
    { id: "community", label: "Community", desc: "Ideas & votes" },
  ] as const;

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = () => {
    setError(null);
    upsertWebhook.mutate({ url, categories: categories as ("forum" | "challenges" | "inbox" | "content" | "events" | "community")[] });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Send platform events to any webhook URL. Use this for custom integrations.
      </p>

      {/* Status */}
      {webhook && (
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              !webhook.isEnabled
                ? "bg-red-500"
                : webhook.consecutiveFailures >= 3
                  ? "bg-yellow-500"
                  : "bg-green-500"
            }`}
          />
          <span className="font-mono text-xs text-muted-foreground">
            {!webhook.isEnabled
              ? "Disabled — 10 consecutive failures"
              : webhook.consecutiveFailures >= 3
                ? `Degraded (${webhook.consecutiveFailures} failures)`
                : "Connected"}
          </span>
        </div>
      )}

      {/* URL */}
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

      {/* Categories */}
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          EVENT SUBSCRIPTIONS
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CATS.map((cat) => (
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

      {/* Error / success */}
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

      {/* Actions */}
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
  );
}

function ClaudeCliPanel({ apiKey }: { apiKey: string }) {
  const t = useTranslations("agent");

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        "ait-community": {
          type: "streamable-http",
          url: "https://www.aitcommunity.org/api/mcp",
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("pasteInstructions", { file: "~/.claude/mcp.json", tool: "Claude CLI" })}
      </p>
      <CodeBlock code={mcpConfig} />
    </div>
  );
}

function OpenClawPanel({ apiKey }: { apiKey: string }) {
  const configSnippet = `// ~/.openclaw/openclaw.json
{
  "skills": {
    "entries": {
      "ait-community": {
        "apiKey": "${apiKey}"
      }
    }
  }
}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Install via{" "}
        <a
          href="https://clawhub.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          ClawHub
        </a>
        :
      </p>
      <CodeBlock code="clawhub install ait-community" />
      <p className="text-sm text-muted-foreground">
        Then add your API key to your OpenClaw config:
      </p>
      <CodeBlock code={configSnippet} />
      <p className="text-xs text-muted-foreground/70">
        The skill auto-connects to the AIT Community MCP server on your next OpenClaw session.
      </p>
    </div>
  );
}

function CustomPanel({ apiKey }: { apiKey: string }) {
  const t = useTranslations("agent");
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
            {t("endpoint")}
          </span>
          <CopyButton text="https://www.aitcommunity.org/api/mcp" />
        </div>
        <code className="block rounded bg-secondary px-3 py-2 font-mono text-sm text-foreground">
          https://www.aitcommunity.org/api/mcp
        </code>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
            API KEY
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
            >
              {showKey ? t("hideKey") : t("showKey")}
            </button>
            <CopyButton text={apiKey} />
          </div>
        </div>
        <code className="block rounded bg-secondary px-3 py-2 font-mono text-sm text-foreground">
          {showKey ? apiKey : `${apiKey.slice(0, 16)}${"•".repeat(20)}`}
        </code>
      </div>
      <span className="block font-mono text-[11px] tracking-wider text-muted-foreground">
        {t("protocol")}
      </span>
    </div>
  );
}

function TestConnectionButton() {
  const t = useTranslations("agent");
  const test = api.agentManagement.testConnection.useQuery(undefined, { enabled: false });
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const handleTest = async () => {
    setStatus("testing");
    const result = await test.refetch();
    setStatus(result.data?.ok ? "ok" : "fail");
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        className="font-mono text-xs tracking-wider"
        onClick={handleTest}
        disabled={status === "testing"}
      >
        {status === "testing" ? "..." : t("testConnection")}
      </Button>
      {status === "ok" && (
        <span className="font-mono text-xs tracking-wider text-green-400">
          {"\u2713"} {t("testSuccess")}
        </span>
      )}
      {status === "fail" && (
        <span className="font-mono text-xs tracking-wider text-destructive">
          {"\u2717"} {t("testFailed")}
        </span>
      )}
    </div>
  );
}

// -- Customize section -------------------------------------------------------

function AgentCustomizeSection({
  agent,
}: {
  agent: { name: string; avatar: string | null; bio: string | null; visibilityMode: string };
}) {
  const [name, setName] = useState(agent.name);
  const [bio, setBio] = useState(agent.bio ?? "");
  const [visibility, setVisibility] = useState<"visible" | "ghost">(
    agent.visibilityMode as "visible" | "ghost",
  );

  const utils = api.useUtils();
  const updateAgent = api.agentManagement.updateAgent.useMutation({
    onSuccess: () => {
      void utils.agentManagement.getMyAgent.invalidate();
    },
  });

  const handleSave = () => {
    updateAgent.mutate({
      name,
      bio: bio || undefined,
      visibilityMode: visibility,
    });
  };

  return (
    <div className="mt-3 space-y-4 rounded border border-border p-4">
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          AGENT NAME
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="mt-1"
        />
      </div>
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">BIO</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={2000}
          rows={2}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          VISIBILITY MODE
        </label>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setVisibility("visible")}
            className={`rounded-lg border px-3 py-2 font-mono text-xs tracking-wider ${
              visibility === "visible"
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            Visible
          </button>
          <button
            type="button"
            onClick={() => setVisibility("ghost")}
            className={`rounded-lg border px-3 py-2 font-mono text-xs tracking-wider ${
              visibility === "ghost"
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary/50"
            }`}
          >
            Ghost
          </button>
        </div>
      </div>
      <Button
        size="sm"
        className="font-mono text-xs tracking-wider"
        onClick={handleSave}
        disabled={updateAgent.isPending || !name.trim()}
      >
        {updateAgent.isPending ? "..." : "Save"}
      </Button>
    </div>
  );
}

// -- Shared helpers ----------------------------------------------------------

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-muted-foreground">
        {code}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}
