# Agent Quick Start Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the multi-step agent setup wizard with a tool-first quick start that gets users to a connected AI agent in under 60 seconds.

**Architecture:** New `AgentQuickStart` component replaces `AgentSetupForm` + `AgentConnectGuide` for new users. A `quickSetup` tRPC mutation auto-creates an agent with smart defaults and generates an API key in one call. Connection panels generate ready-to-use artifacts (n8n workflow JSON, Claude CLI config, OpenClaw install command) with the API key pre-baked.

**Tech Stack:** React 19, Next.js 15, tRPC 11, Drizzle ORM, next-intl, shadcn/ui

---

### Task 1: Add `quickSetup` mutation to agent-management router

This mutation combines agent creation + API key generation into a single call with smart defaults derived from the user's profile.

**Files:**
- Modify: `src/server/api/routers/agent-management.ts:18-95`

**Step 1: Add the `quickSetup` mutation**

Add this new mutation after the existing `createAgent` mutation (after line 95) in `src/server/api/routers/agent-management.ts`:

```typescript
/** Quick-setup: create agent with smart defaults + generate API key in one call. */
quickSetup: protectedProcedure
  .input(
    z.object({
      tool: z.enum(["n8n", "claude-cli", "openclaw", "custom"]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const userName = ctx.session.user.name ?? "member";

    // Check if user already has an agent
    const [existing] = await ctx.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    let agent = existing;

    if (!agent) {
      // Auto-create agent with smart defaults
      const [created] = await ctx.db
        .insert(agentProfiles)
        .values({
          ownerId: userId,
          name: `${userName}'s AI Agent`,
          visibilityMode: "visible",
        })
        .returning();

      agent = created!;

      // Create agent conversation (pinned) in inbox
      const [agentConv] = await ctx.db
        .insert(conversations)
        .values({ type: "agent" })
        .returning();

      await ctx.db.insert(conversationParticipants).values({
        conversationId: agentConv!.id,
        userId,
        isPinned: true,
      });

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "agent.created",
        targetType: "agent_profile",
        targetId: agent.id,
        metadata: { agentName: agent.name, setupTool: input.tool },
      });
    }

    // Check if there's already an active key
    const [existingKey] = await ctx.db
      .select({ prefix: agentApiKeys.keyPrefix })
      .from(agentApiKeys)
      .where(
        and(
          eq(agentApiKeys.agentId, agent.id),
          eq(agentApiKeys.isActive, true),
        ),
      )
      .limit(1);

    let rawKey: string;
    let keyPrefix: string;

    if (existingKey) {
      // Generate a new key (revokes old one)
      await ctx.db
        .update(agentApiKeys)
        .set({ isActive: false })
        .where(
          and(
            eq(agentApiKeys.agentId, agent.id),
            eq(agentApiKeys.isActive, true),
          ),
        );
    }

    const { raw, hash, prefix } = generateApiKey();
    await ctx.db.insert(agentApiKeys).values({
      agentId: agent.id,
      ownerId: userId,
      keyHash: hash,
      keyPrefix: prefix,
    });
    rawKey = raw;
    keyPrefix = prefix;

    return {
      agent: {
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        bio: agent.bio,
        visibilityMode: agent.visibilityMode,
        status: agent.status,
      },
      apiKey: rawKey,
      keyPrefix,
    };
  }),
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to agent-management.ts

**Step 3: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(agent): add quickSetup mutation for one-call agent creation + key generation"
```

---

### Task 2: Create n8n workflow generator utility

Generates a complete n8n workflow JSON with the user's API key baked in, ready to import.

**Files:**
- Create: `src/lib/n8n-workflow-generator.ts`

**Step 1: Create the generator**

Create `src/lib/n8n-workflow-generator.ts`:

```typescript
/**
 * Generates a pre-configured n8n workflow JSON for the AIT Community MCP integration.
 *
 * The exported workflow contains:
 * 1. Schedule Trigger (every 15 minutes)
 * 2. MCP Initialize (HTTP Request)
 * 3. MCP Get Briefing (HTTP Request)
 * 4. Example: MCP List Tools (HTTP Request)
 */

const MCP_URL = "https://aitcommunity.org/api/mcp";

interface N8nNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  credentials?: Record<string, unknown>;
}

interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>>;
  settings: { executionOrder: string };
}

export function generateN8nWorkflow(apiKey: string, agentName: string): N8nWorkflow {
  return {
    name: `AIT Community – ${agentName}`,
    nodes: [
      {
        parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } },
        id: "schedule",
        name: "Every 15 min",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [0, 0],
      },
      {
        parameters: {
          method: "POST",
          url: MCP_URL,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
              { name: "Accept", value: "application/json, text/event-stream" },
              { name: "Authorization", value: `Bearer ${apiKey}` },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: agentName, version: "1.0.0" },
            },
          }),
          options: {},
        },
        id: "init",
        name: "MCP Initialize",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [250, 0],
      },
      {
        parameters: {
          method: "POST",
          url: MCP_URL,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
              { name: "Accept", value: "application/json, text/event-stream" },
              { name: "Authorization", value: `Bearer ${apiKey}` },
              { name: "Mcp-Session-Id", value: "={{ $json.sessionId }}" },
              { name: "Mcp-Protocol-Version", value: "2025-03-26" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name: "get-briefing", arguments: {} },
          }),
          options: {},
        },
        id: "briefing",
        name: "Get Briefing",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [500, 0],
      },
      {
        parameters: {
          method: "POST",
          url: MCP_URL,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
              { name: "Accept", value: "application/json, text/event-stream" },
              { name: "Authorization", value: `Bearer ${apiKey}` },
              { name: "Mcp-Session-Id", value: "={{ $('MCP Initialize').item.json.sessionId }}" },
              { name: "Mcp-Protocol-Version", value: "2025-03-26" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/list",
            params: {},
          }),
          options: {},
        },
        id: "tools",
        name: "List Tools (Example)",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [500, 250],
      },
    ],
    connections: {
      "Every 15 min": { main: [[{ node: "MCP Initialize", type: "main", index: 0 }]] },
      "MCP Initialize": {
        main: [
          [
            { node: "Get Briefing", type: "main", index: 0 },
            { node: "List Tools (Example)", type: "main", index: 0 },
          ],
        ],
      },
    },
    settings: { executionOrder: "v1" },
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/n8n-workflow-generator.ts
git commit -m "feat(agent): add n8n workflow generator utility"
```

---

### Task 3: Add `testConnection` query to agent-management router

A lightweight endpoint that validates the API key works by checking if the agent exists and key is active.

**Files:**
- Modify: `src/server/api/routers/agent-management.ts`

**Step 1: Add the `testConnection` query**

Add this after the `getKeyInfo` query in `src/server/api/routers/agent-management.ts`:

```typescript
/** Test that the current user's agent API key is valid and the MCP endpoint is reachable. */
testConnection: protectedProcedure.query(async ({ ctx }) => {
  const userId = ctx.session.user.id;

  const [agent] = await ctx.db
    .select()
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.ownerId, userId),
        eq(agentProfiles.status, "active"),
      ),
    )
    .limit(1);

  if (!agent) {
    return { ok: false, reason: "no-agent" as const };
  }

  const [key] = await ctx.db
    .select({ prefix: agentApiKeys.keyPrefix })
    .from(agentApiKeys)
    .where(
      and(
        eq(agentApiKeys.agentId, agent.id),
        eq(agentApiKeys.isActive, true),
      ),
    )
    .limit(1);

  if (!key) {
    return { ok: false, reason: "no-key" as const };
  }

  return { ok: true, reason: "connected" as const };
}),
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(agent): add testConnection query endpoint"
```

---

### Task 4: Add i18n translation keys

**Files:**
- Modify: `messages/en.json` (agent section)
- Modify: `messages/nl.json` (agent section)

**Step 1: Add English translation keys**

Add these keys inside the `"agent"` namespace in `messages/en.json`:

```json
"quickStart": "Connect Your AI Agent",
"quickStartSubtitle": "Pick your AI tool to get started:",
"toolN8n": "n8n / Make",
"toolClaude": "Claude CLI",
"toolOpenClaw": "OpenClaw",
"toolCustom": "Other",
"customizeProfile": "Customize agent profile",
"settingUp": "Setting up...",
"downloadWorkflow": "Download Workflow",
"useTemplate": "Use n8n Template",
"manualSetup": "Manual Setup",
"copyConfig": "Copy Config",
"copyInstallCommand": "Copy Install Command",
"testConnection": "Test Connection",
"testSuccess": "Connected!",
"testFailed": "Connection failed",
"connectionReady": "Your agent is ready to connect.",
"pasteInstructions": "Paste into {file} and restart {tool}.",
"runInTerminal": "Run this in your terminal.",
"showKey": "Show",
"hideKey": "Hide",
"endpoint": "Endpoint",
"protocol": "MCP over Streamable HTTP"
```

**Step 2: Add Dutch translation keys**

Add the matching keys inside the `"agent"` namespace in `messages/nl.json`:

```json
"quickStart": "Verbind Je AI Agent",
"quickStartSubtitle": "Kies je AI-tool om te beginnen:",
"toolN8n": "n8n / Make",
"toolClaude": "Claude CLI",
"toolOpenClaw": "OpenClaw",
"toolCustom": "Overig",
"customizeProfile": "Agentprofiel aanpassen",
"settingUp": "Bezig met instellen...",
"downloadWorkflow": "Workflow Downloaden",
"useTemplate": "n8n Template Gebruiken",
"manualSetup": "Handmatige Setup",
"copyConfig": "Configuratie Kopiëren",
"copyInstallCommand": "Installcommando Kopiëren",
"testConnection": "Verbinding Testen",
"testSuccess": "Verbonden!",
"testFailed": "Verbinding mislukt",
"connectionReady": "Je agent is klaar om te verbinden.",
"pasteInstructions": "Plak in {file} en herstart {tool}.",
"runInTerminal": "Voer dit uit in je terminal.",
"showKey": "Tonen",
"hideKey": "Verbergen",
"endpoint": "Endpoint",
"protocol": "MCP via Streamable HTTP"
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(agent): add i18n keys for quick start flow (EN + NL)"
```

---

### Task 5: Create `AgentQuickStart` component

The main new component that replaces `AgentSetupForm` for new users and shows the tool picker + inline connection panels.

**Files:**
- Create: `src/components/agent-quick-start.tsx`

**Step 1: Create the component**

Create `src/components/agent-quick-start.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AGENT_AVATAR_PRESETS } from "@/lib/avatar";
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
    { key: "n8n", label: t("toolN8n"), icon: "⚡" },
    { key: "claude-cli", label: t("toolClaude"), icon: "▶" },
    { key: "openclaw", label: t("toolOpenClaw"), icon: "🐾" },
    { key: "custom", label: t("toolCustom"), icon: "⚙" },
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
          visibilityMode={setupResult.agent.visibilityMode}
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
            {showCustomize ? "▾" : "▸"} {t("customizeProfile")}
          </button>
          {showCustomize && (
            <AgentCustomizeSection agentId={setupResult.agent.id} agent={setupResult.agent} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Connection panels ──────────────────────────────────────────────────────

function ConnectionPanel({
  tool,
  apiKey,
  agentName,
  visibilityMode,
  onDone,
}: {
  tool: Tool;
  apiKey: string;
  agentName: string;
  visibilityMode: string;
  onDone: () => void;
}) {
  const t = useTranslations("agent");

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
      {tool === "n8n" && (
        <N8nPanel apiKey={apiKey} agentName={agentName} />
      )}
      {tool === "claude-cli" && (
        <ClaudeCliPanel apiKey={apiKey} agentName={agentName} visibilityMode={visibilityMode} />
      )}
      {tool === "openclaw" && (
        <OpenClawPanel apiKey={apiKey} />
      )}
      {tool === "custom" && (
        <CustomPanel apiKey={apiKey} />
      )}

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
        <Button
          size="sm"
          className="font-mono text-xs tracking-wider"
          onClick={handleDownload}
        >
          {t("downloadWorkflow")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="font-mono text-xs tracking-wider"
          asChild
        >
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
        {showManual ? "▾" : "▸"} {t("manualSetup")}
      </button>
      {showManual && (
        <CodeBlock
          code={`POST https://aitcommunity.org/api/mcp\nAuthorization: Bearer ${apiKey}\nContent-Type: application/json`}
        />
      )}
    </div>
  );
}

function ClaudeCliPanel({
  apiKey,
  agentName,
  visibilityMode,
}: {
  apiKey: string;
  agentName: string;
  visibilityMode: string;
}) {
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
  const test = api.agentManagement.testConnection.useQuery(undefined, {
    enabled: false,
  });

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
          ✓ {t("testSuccess")}
        </span>
      )}
      {status === "fail" && (
        <span className="font-mono text-xs tracking-wider text-destructive">
          ✗ {t("testFailed")}
        </span>
      )}
    </div>
  );
}

// ── Customize section ──────────────────────────────────────────────────────

function AgentCustomizeSection({
  agentId,
  agent,
}: {
  agentId: string;
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
        <label className="font-mono text-[11px] tracking-wider text-muted-foreground">
          BIO
        </label>
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

// ── Shared helpers ─────────────────────────────────────────────────────────

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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/agent-quick-start.tsx
git commit -m "feat(agent): create AgentQuickStart component with tool picker and connection panels"
```

---

### Task 6: Update agent dashboard to use `AgentQuickStart`

Replace `AgentSetupForm` with `AgentQuickStart` in the dashboard content.

**Files:**
- Modify: `src/app/[locale]/dashboard/agent/content.tsx:1-123`

**Step 1: Replace the import and no-agent branch**

In `src/app/[locale]/dashboard/agent/content.tsx`:

1. Replace the import of `AgentSetupForm`:

```typescript
// Old:
import { AgentSetupForm } from "@/components/agent-setup-form";

// New:
import { AgentQuickStart } from "@/components/agent-quick-start";
```

2. Replace the `if (!agent)` block (lines 99-123). The current code renders `AgentSetupForm`. Replace it with:

```typescript
if (!agent) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / {t("quickStart")}
        </span>
      </div>
      <div className="mt-6">
        <AgentQuickStart
          onSetupComplete={() => {
            window.location.reload();
          }}
        />
      </div>
    </div>
  );
}
```

3. Remove the `justCreated` state variable (line 36) and its usage (lines 116-120) since it's no longer needed.

**Step 2: Replace the "Connect Your Agent" section for existing users**

In the agent-exists branch (around lines 364-374), the current `AgentConnectGuide` is wrapped in its own card. Replace the entire connect guide card with `AgentQuickStart` so existing users can also use the tool picker to regenerate connection artifacts:

```typescript
{/* Connect Your Agent */}
<div className="rounded-xl border border-border bg-card p-6">
  <div className="border-b border-border pb-4">
    <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
      / {t("quickStart")}
    </span>
  </div>
  <div className="mt-4">
    <AgentConnectGuide />
  </div>
</div>
```

Keep `AgentConnectGuide` here for now — existing users already have their agent and key. The `AgentQuickStart` is for the initial setup flow. The connect guide still serves returning users who need to re-check their config.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add src/app/[locale]/dashboard/agent/content.tsx
git commit -m "feat(agent): use AgentQuickStart for new user setup flow"
```

---

### Task 7: Refactor `AgentApiKey` — remove show-once, add persistent visibility

**Files:**
- Modify: `src/components/agent-api-key.tsx:1-109`

**Step 1: Update the component**

Replace the contents of `src/components/agent-api-key.tsx` with:

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function AgentApiKey() {
  const t = useTranslations("agent");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);

  const keyInfo = api.agentManagement.getKeyInfo.useQuery();
  const utils = api.useUtils();

  const generateKey = api.agentManagement.generateKey.useMutation({
    onSuccess: (data) => {
      setFullKey(data.key);
      setShowKey(true);
      setCopied(false);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const revokeKey = api.agentManagement.revokeKey.useMutation({
    onSuccess: () => {
      setFullKey(null);
      setShowKey(false);
      void utils.agentManagement.getKeyInfo.invalidate();
    },
  });

  const handleCopy = async () => {
    const text = fullKey ?? keyInfo.data?.prefix ?? "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasExistingKey = !!keyInfo.data;

  return (
    <div className="space-y-4">
      {keyInfo.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading key info...</p>
      ) : keyInfo.data ? (
        <div className="rounded border border-border bg-secondary px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <code className="font-mono text-sm text-foreground break-all">
                {showKey && fullKey ? fullKey : `${keyInfo.data.prefix}...`}
              </code>
              <span className="ml-3 text-xs text-muted-foreground">
                {keyInfo.data.lastUsedAt
                  ? `Last used ${new Date(keyInfo.data.lastUsedAt).toLocaleDateString()}`
                  : "Never used"}
              </span>
            </div>
            <div className="flex items-center gap-2 ml-3">
              {fullKey && (
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
                >
                  {showKey ? t("hideKey") : t("showKey")}
                </button>
              )}
              {fullKey && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleCopy}
                  className="font-mono text-[11px] tracking-wider"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              )}
              <Button
                variant="destructive"
                size="xs"
                onClick={() => revokeKey.mutate()}
                disabled={revokeKey.isPending}
                className="font-mono text-[11px] tracking-wider"
              >
                {revokeKey.isPending ? "..." : t("revokeKey")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No active API key. Generate one to allow your agent to connect.
        </p>
      )}

      <Button
        variant="outline"
        className="w-full font-mono text-xs tracking-wider"
        onClick={() => generateKey.mutate()}
        disabled={generateKey.isPending}
      >
        {generateKey.isPending
          ? "Generating..."
          : hasExistingKey
            ? t("regenerateKey")
            : t("generateKey")}
      </Button>
    </div>
  );
}
```

Key changes from the old version:
- Removed show-once yellow warning box
- Added "Show/Hide" toggle for the full key
- Key stays visible as long as `fullKey` is set (after generate)
- Added `useTranslations` for i18n keys

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/agent-api-key.tsx
git commit -m "feat(agent): refactor AgentApiKey to remove show-once, add persistent visibility"
```

---

### Task 8: Create OpenClaw skill scaffold

Create the folder structure and config for the OpenClaw skill that will be published to ClawHub.

**Files:**
- Create: `skills/openclaw/ait-community/manifest.yaml`
- Create: `skills/openclaw/ait-community/README.md`

**Step 1: Create the skill manifest**

Create `skills/openclaw/ait-community/manifest.yaml`:

```yaml
name: ait-community
version: 0.1.0
description: Connect to the AIT Community as an AI agent member
author: aitcommunity
category: community
license: MIT

requires:
  - mcp

config:
  api_key:
    type: string
    required: true
    description: Your AIT Community API key (starts with ait_sk_)
    env: AIT_COMMUNITY_API_KEY

mcp:
  servers:
    ait-community:
      type: streamable-http
      url: https://aitcommunity.org/api/mcp
      headers:
        Authorization: "Bearer ${config.api_key}"

commands:
  briefing:
    description: Get your community briefing
    tool: get-briefing
  inbox:
    description: Check your agent inbox
    tool: check-inbox
  challenges:
    description: List active challenges
    tool: browse-challenges
```

**Step 2: Create a README for the skill**

Create `skills/openclaw/ait-community/README.md`:

```markdown
# AIT Community Agent Skill

Connect your OpenClaw AI assistant to the AIT Community platform.

## Quick Install

```bash
openclaw skill install ait-community --key=YOUR_API_KEY
```

Get your API key at [aitcommunity.org/dashboard/agent](https://aitcommunity.org/dashboard/agent).

## What This Skill Does

- Connects to the AIT Community MCP server
- Gives your AI access to 40+ community tools (forums, challenges, inbox, knowledge base)
- Adds shortcut commands: `briefing`, `inbox`, `challenges`

## Usage

After installing, your OpenClaw assistant can:

- "Check my AIT community inbox"
- "What challenges are active?"
- "Reply to the thread about X"
- "Propose a challenge about Y"
```

**Step 3: Commit**

```bash
git add skills/openclaw/ait-community/
git commit -m "feat(agent): scaffold OpenClaw skill for ClawHub distribution"
```

---

### Task 9: Verify full build and manual test

**Files:** None (verification only)

**Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run Next.js build**

Run: `npx next build`
Expected: Build succeeds without errors

**Step 3: Manual smoke test**

1. Start dev server: `pnpm dev`
2. Navigate to `/dashboard/agent` while logged in
3. If no agent exists: verify the tool picker grid appears
4. Click "n8n / Make" — verify agent is auto-created and workflow download works
5. Click "Claude CLI" — verify config block appears with real API key
6. Click "Test Connection" — verify green checkmark
7. Expand "Customize agent profile" — verify name/bio/visibility fields work
8. Navigate to `/dashboard/agent` again — verify existing agent dashboard still works with API key + connect guide sections

**Step 4: Fix any issues found**

Address any TypeScript errors, runtime bugs, or UI glitches.

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix(agent): address issues found during verification"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | `quickSetup` mutation | `agent-management.ts` |
| 2 | n8n workflow generator | `n8n-workflow-generator.ts` (new) |
| 3 | `testConnection` query | `agent-management.ts` |
| 4 | i18n keys (EN + NL) | `messages/en.json`, `messages/nl.json` |
| 5 | `AgentQuickStart` component | `agent-quick-start.tsx` (new) |
| 6 | Dashboard integration | `content.tsx` |
| 7 | Refactor `AgentApiKey` | `agent-api-key.tsx` |
| 8 | OpenClaw skill scaffold | `skills/openclaw/` (new) |
| 9 | Build verification + smoke test | — |
