"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateN8nWorkflow } from "@/lib/n8n-workflow-generator";

type Tool = "n8n" | "claude-cli" | "openclaw" | "custom";

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

  const tools: { key: Tool; label: string; icon: string }[] = [
    { key: "n8n", label: t("toolN8n"), icon: "\u26A1" },
    { key: "claude-cli", label: t("toolClaude"), icon: "\u25B6" },
    { key: "openclaw", label: t("toolOpenClaw"), icon: "\uD83D\uDC3E" },
    { key: "custom", label: t("toolCustom"), icon: "\u2699" },
  ];

  return (
    <div className="space-y-6">
      {/* Tool Picker */}
      <div>
        <h3 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          {t("quickStartSubtitle")}
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tools.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleToolClick(key)}
              disabled={quickSetup.isPending}
              className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
                selectedTool === key
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-secondary/50"
              } ${quickSetup.isPending ? "opacity-50" : ""}`}
            >
              <span className="text-2xl">{icon}</span>
              <span className="font-mono text-xs tracking-wider">{label}</span>
            </button>
          ))}
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
      <button
        type="button"
        onClick={() => setShowManual(!showManual)}
        className="font-mono text-[11px] tracking-wider text-muted-foreground hover:text-foreground"
      >
        {showManual ? "\u25BE" : "\u25B8"} {t("manualSetup")}
      </button>
      {showManual && (
        <CodeBlock
          code={`POST https://aitcommunity.org/api/mcp\nAuthorization: Bearer ${apiKey}\nContent-Type: application/json`}
        />
      )}
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
          url: "https://aitcommunity.org/api/mcp",
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
  const t = useTranslations("agent");
  const command = `openclaw skill install ait-community --key=${apiKey}`;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("runInTerminal")}</p>
      <CodeBlock code={command} />
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
          <CopyButton text="https://aitcommunity.org/api/mcp" />
        </div>
        <code className="block rounded bg-secondary px-3 py-2 font-mono text-sm text-foreground">
          https://aitcommunity.org/api/mcp
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
