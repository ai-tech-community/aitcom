# Hackathon Pre-Lock Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Workers must NOT run `git checkout`/`git switch`** — all tasks happen on the current branch (`feat/agents-tool-catalog`).

**Goal:** Replace the bare "workspace opens when rosters lock" line with a pre-lock briefing — task-grid preview, scoring, agent readiness checklist, and the relevant agent tool catalog — per `docs/superpowers/specs/2026-06-11-hackathon-prelock-briefing-design.md`.

**Architecture:** The team page (server component) detects "no competitive grid yet" and renders a new `HackathonBriefing` server component instead of `TeamWorkspace`. The briefing embeds one client island (`AgentReadinessChecklist`, composed from existing tRPC queries) and a `ToolCatalogList` extracted from the `/agents` page. No new tRPC procedures, no schema changes.

**Tech Stack:** Next.js App Router (server components), tRPC v11 + React Query v5, Payload (challenges collection), drizzle, next-intl, vitest.

---

### Task 1: `deriveAgentReadiness` pure function (TDD)

**Files:**
- Create: `src/components/hackathon/briefing/agent-readiness.ts`
- Test: `src/components/hackathon/briefing/agent-readiness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/hackathon/briefing/agent-readiness.test.ts
import { describe, it, expect } from "vitest";

import { deriveAgentReadiness } from "./agent-readiness";

const REQUIRED = ["solve-code-cell", "polish-text"];

describe("deriveAgentReadiness", () => {
  it("no agent: nothing ready, all required types missing", () => {
    const r = deriveAgentReadiness({
      agent: null,
      commissions: [],
      requiredTaskTypes: REQUIRED,
    });
    expect(r).toEqual({
      hasActiveAgent: false,
      hasActiveCommission: false,
      missingTaskTypes: REQUIRED,
      ready: false,
    });
  });

  it("inactive agent does not count", () => {
    const r = deriveAgentReadiness({
      agent: { status: "inactive" },
      commissions: [],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.hasActiveAgent).toBe(false);
    expect(r.ready).toBe(false);
  });

  it("revoked commission does not count", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [
        { revokedAt: new Date(), taskTypeAllowlist: REQUIRED },
      ],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.hasActiveCommission).toBe(false);
    expect(r.missingTaskTypes).toEqual(REQUIRED);
    expect(r.ready).toBe(false);
  });

  it("partial allowlist: names exactly the missing types", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [
        { revokedAt: null, taskTypeAllowlist: ["solve-code-cell"] },
      ],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.hasActiveCommission).toBe(true);
    expect(r.missingTaskTypes).toEqual(["polish-text"]);
    expect(r.ready).toBe(false);
  });

  it("coverage may span multiple active commissions", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [
        { revokedAt: null, taskTypeAllowlist: ["solve-code-cell"] },
        { revokedAt: null, taskTypeAllowlist: ["polish-text"] },
      ],
      requiredTaskTypes: REQUIRED,
    });
    expect(r.missingTaskTypes).toEqual([]);
    expect(r.ready).toBe(true);
  });

  it("duplicate required types are deduped", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [{ revokedAt: null, taskTypeAllowlist: [] }],
      requiredTaskTypes: ["polish-text", "polish-text"],
    });
    expect(r.missingTaskTypes).toEqual(["polish-text"]);
  });

  it("no required types (empty template): allowlist check passes", () => {
    const r = deriveAgentReadiness({
      agent: { status: "active" },
      commissions: [{ revokedAt: null, taskTypeAllowlist: [] }],
      requiredTaskTypes: [],
    });
    expect(r).toEqual({
      hasActiveAgent: true,
      hasActiveCommission: true,
      missingTaskTypes: [],
      ready: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/hackathon/briefing/agent-readiness.test.ts`
Expected: FAIL — "Cannot find module './agent-readiness'" (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

```ts
// src/components/hackathon/briefing/agent-readiness.ts
// Pure derivation of a member's agent-readiness for a hackathon: shared by the
// checklist UI and its tests. Client-safe — no server imports. Mirrors the
// claim predicates in work-grid.ts (active agent, non-revoked commission,
// taskType in allowlist) WITHOUT hitting the database.

export type ReadinessAgent = { status: string } | null;

export type ReadinessCommission = {
  revokedAt: Date | null;
  taskTypeAllowlist: string[];
};

export type AgentReadiness = {
  hasActiveAgent: boolean;
  hasActiveCommission: boolean;
  /** Required task types no active commission covers ([] = covered). */
  missingTaskTypes: string[];
  ready: boolean;
};

export function deriveAgentReadiness(input: {
  agent: ReadinessAgent;
  commissions: ReadinessCommission[];
  requiredTaskTypes: string[];
}): AgentReadiness {
  const hasActiveAgent = input.agent?.status === "active";

  const active = input.commissions.filter((c) => c.revokedAt === null);
  const hasActiveCommission = active.length > 0;

  const allowed = new Set(active.flatMap((c) => c.taskTypeAllowlist));
  const missingTaskTypes = hasActiveCommission
    ? [...new Set(input.requiredTaskTypes)].filter((t) => !allowed.has(t))
    : [...new Set(input.requiredTaskTypes)];

  return {
    hasActiveAgent,
    hasActiveCommission,
    missingTaskTypes,
    ready: hasActiveAgent && hasActiveCommission && missingTaskTypes.length === 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/hackathon/briefing/agent-readiness.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/hackathon/briefing/agent-readiness.ts src/components/hackathon/briefing/agent-readiness.test.ts
git commit -m "feat(hackathon): pure agent-readiness derivation for pre-lock briefing"
```

---

### Task 2: Extract `ToolCatalogList` from the /agents page

**Files:**
- Create: `src/components/agents/tool-catalog-list.tsx`
- Modify: `src/app/[locale]/agents/page.tsx` (replace inline group rendering, delete local `gateStyles`)

- [ ] **Step 1: Create the shared component**

The body is the group-rendering JSX currently inlined at `src/app/[locale]/agents/page.tsx:76-104`, plus the `gateStyles` map from lines 24-30, unchanged:

```tsx
// src/components/agents/tool-catalog-list.tsx
// Shared rendering for registry-derived tool-catalog groups (gate badges +
// per-surface sections). Server component — used by /agents and the hackathon
// pre-lock briefing. Tool names/descriptions come from the MCP registry and
// are not translated; surface/gate labels come from the agentsCatalog
// namespace.
import { getTranslations } from "next-intl/server";

import type { CatalogGroup, ToolGate } from "@/server/mcp/catalog-meta";

const gateStyles: Record<ToolGate, string> = {
  public: "text-green-700 border-green-200 bg-green-50",
  read: "text-zinc-500 border-zinc-200",
  contribute: "text-primary border-primary/30 bg-primary/5",
  "self-profile": "text-zinc-600 border-zinc-300",
  commission: "text-amber-700 border-amber-200 bg-amber-50",
};

export async function ToolCatalogList({ groups }: { groups: CatalogGroup[] }) {
  const t = await getTranslations("agentsCatalog");

  return (
    <>
      {groups.map((group) => (
        <div key={group.surface} className="mt-8">
          <h3 className="text-muted-foreground border-b pb-2 font-mono text-[11px] font-semibold tracking-widest uppercase">
            / {t(`surfaces.${group.surface}`)}
          </h3>
          <ul className="divide-border mt-1 divide-y">
            {group.tools.map((tool) => (
              <li
                key={tool.name}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-64">
                  <code className="font-mono text-xs font-semibold">
                    {tool.name}
                  </code>
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase ${gateStyles[tool.gate]}`}
                  >
                    {t(`gates.${tool.gate}`)}
                  </span>
                </div>
                <p className="text-muted-foreground min-w-0 text-xs leading-relaxed">
                  {tool.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Use it in the /agents page**

In `src/app/[locale]/agents/page.tsx`:
- Delete the local `gateStyles` const (lines 24-30) and the `type ToolGate` import.
- Add `import { ToolCatalogList } from "@/components/agents/tool-catalog-list";`
- Replace the `{groups.map((group) => ( ... ))}` block (lines 76-104) with:

```tsx
        <ToolCatalogList groups={groups} />
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm exec vitest run src/server/mcp`
Expected: typecheck clean; catalog drift test still passes (skips without RUN_DB_TESTS is fine — it must not FAIL).

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/tool-catalog-list.tsx "src/app/[locale]/agents/page.tsx"
git commit -m "refactor(agents): extract ToolCatalogList for reuse in hackathon briefing"
```

---

### Task 3: i18n keys for the briefing

**Files:**
- Modify: `messages/en.json` (inside the existing `"hackathon"` namespace, after `"workspaceLocked"`)
- Modify: `messages/nl.json` (same position)

- [ ] **Step 1: Add English keys**

Insert into the `"hackathon"` object in `messages/en.json` (after the `"workspaceLocked"` entry):

```json
    "briefing": {
      "title": "Get ready — rosters haven't locked yet",
      "subtitle": "When the organizer locks rosters, the hacking window opens and this page becomes your team's live work grid. Here's everything to know — and set up — before that moment.",
      "planTitle": "The plan",
      "planIntro": "Every team races an identical grid cloned from these tasks. Claim a task, do the work, report the result, and the organizer verifies it.",
      "planEmpty": "The organizer is still preparing the task grid — tasks will appear here before the hackathon starts.",
      "deadline": "{minutes} min deadline",
      "verifiedBy": "verified by {mode}",
      "rosterTitle": "Your team",
      "scoringTitle": "How you win",
      "scoringBody": "Your score is the sum of your verified cells — each verified cell counts with a weight set by its verification mode. Unverified work scores nothing, so report results and get them verified.",
      "tiebreakSpeed": "Ties break by who submitted first.",
      "tiebreakThoroughness": "Ties break by thoroughness.",
      "tiebreakCollaboration": "Ties break by collaboration.",
      "prizeXp": "{xp} XP split equally among the winning team",
      "prizeBadge": "Badge: {badge}",
      "agentTitle": "Work with your agent",
      "agentIntro": "You can commission an AI agent to claim and complete tasks alongside you over MCP. Agents are optional — you can claim every cell yourself — but a well-scoped agent is an extra pair of hands.",
      "attribution": "Attribution is automatic: every cell records whether you or your agent did it. There's nothing to disclose manually.",
      "readinessTitle": "Agent readiness",
      "readinessAgent": "Agent registered and active",
      "readinessCommission": "Commission granted",
      "readinessAllowlist": "Commission covers this hackathon's task types",
      "readinessMissing": "Missing from your allowlist: {types}",
      "readinessReady": "Your agent is ready for the starting gun.",
      "readinessCta": "Manage agent & commission",
      "toolsTitle": "What your agent can do here",
      "toolsIntro": "The tools below are the hackathon-relevant capabilities live on the MCP endpoint.",
      "fullCatalog": "Browse the full tool catalog",
      "helpTitle": "Questions?",
      "helpBody": "Ask in the challenge channel — organizers and other teams are there.",
      "helpChallenge": "Open the challenge",
      "helpEvent": "Back to the event"
    },
```

- [ ] **Step 2: Add Dutch keys**

Insert into the `"hackathon"` object in `messages/nl.json` (after `"workspaceLocked"`):

```json
    "briefing": {
      "title": "Maak je klaar — de teams liggen nog niet vast",
      "subtitle": "Zodra de organisator de teams vastzet, opent het hackvenster en wordt deze pagina het live werkrooster van je team. Dit is alles wat je moet weten — en instellen — vóór dat moment.",
      "planTitle": "Het plan",
      "planIntro": "Elk team racet door een identiek rooster, gekloond uit deze taken. Claim een taak, doe het werk, rapporteer het resultaat en de organisator verifieert het.",
      "planEmpty": "De organisator bereidt het takenrooster nog voor — taken verschijnen hier vóór de start van de hackathon.",
      "deadline": "{minutes} min deadline",
      "verifiedBy": "geverifieerd via {mode}",
      "rosterTitle": "Je team",
      "scoringTitle": "Zo win je",
      "scoringBody": "Je score is de som van je geverifieerde cellen — elke geverifieerde cel telt met een gewicht dat door de verificatiemodus wordt bepaald. Ongeverifieerd werk telt niet, dus rapporteer resultaten en laat ze verifiëren.",
      "tiebreakSpeed": "Bij gelijkspel wint wie het eerst indiende.",
      "tiebreakThoroughness": "Bij gelijkspel wint grondigheid.",
      "tiebreakCollaboration": "Bij gelijkspel wint samenwerking.",
      "prizeXp": "{xp} XP gelijk verdeeld over het winnende team",
      "prizeBadge": "Badge: {badge}",
      "agentTitle": "Werk samen met je agent",
      "agentIntro": "Je kunt een AI-agent machtigen om via MCP taken te claimen en uit te voeren naast jou. Agents zijn optioneel — je kunt elke cel zelf claimen — maar een goed afgebakende agent is een extra paar handen.",
      "attribution": "Toeschrijving is automatisch: elke cel registreert of jij of je agent het werk deed. Je hoeft niets handmatig te melden.",
      "readinessTitle": "Agent-gereedheid",
      "readinessAgent": "Agent geregistreerd en actief",
      "readinessCommission": "Machtiging verleend",
      "readinessAllowlist": "Machtiging dekt de taaktypen van deze hackathon",
      "readinessMissing": "Ontbreekt in je allowlist: {types}",
      "readinessReady": "Je agent is klaar voor het startschot.",
      "readinessCta": "Beheer agent & machtiging",
      "toolsTitle": "Wat je agent hier kan doen",
      "toolsIntro": "De tools hieronder zijn de hackathon-relevante mogelijkheden op het MCP-endpoint.",
      "fullCatalog": "Bekijk de volledige toolcatalogus",
      "helpTitle": "Vragen?",
      "helpBody": "Stel ze in het challenge-kanaal — organisatoren en andere teams zijn daar.",
      "helpChallenge": "Open de challenge",
      "helpEvent": "Terug naar het event"
    },
```

- [ ] **Step 3: Verify JSON is valid**

Run: `python3 -c "import json; json.load(open('messages/en.json')); json.load(open('messages/nl.json')); print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "i18n(hackathon): briefing keys (en, nl)"
```

---

### Task 4: `AgentReadinessChecklist` client island

**Files:**
- Create: `src/components/hackathon/briefing/agent-readiness-checklist.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/hackathon/briefing/agent-readiness-checklist.tsx
"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Circle } from "lucide-react";

import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { deriveAgentReadiness } from "./agent-readiness";

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-hidden />
      ) : (
        <Circle className="text-muted-foreground size-4 shrink-0" aria-hidden />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

export function AgentReadinessChecklist({
  requiredTaskTypes,
}: {
  requiredTaskTypes: string[];
}) {
  const t = useTranslations("hackathon.briefing");
  const { data: agent, isLoading: agentLoading } =
    api.agentManagement.getMyAgent.useQuery();
  const { data: commissions, isLoading: commissionsLoading } =
    api.commissions.listMine.useQuery();

  if (agentLoading || commissionsLoading) return null;

  const readiness = deriveAgentReadiness({
    agent: agent ?? null,
    commissions: commissions ?? [],
    requiredTaskTypes,
  });

  return (
    <div className="border-border rounded-md border p-4">
      <h4 className="text-sm font-semibold">{t("readinessTitle")}</h4>
      <ul className="mt-2 space-y-1.5">
        <CheckRow ok={readiness.hasActiveAgent} label={t("readinessAgent")} />
        <CheckRow
          ok={readiness.hasActiveCommission}
          label={t("readinessCommission")}
        />
        <CheckRow
          ok={
            readiness.hasActiveCommission &&
            readiness.missingTaskTypes.length === 0
          }
          label={t("readinessAllowlist")}
        />
      </ul>
      {readiness.missingTaskTypes.length > 0 &&
      readiness.hasActiveCommission ? (
        <p className="mt-2 font-mono text-xs text-amber-700">
          {t("readinessMissing", {
            types: readiness.missingTaskTypes.join(", "),
          })}
        </p>
      ) : null}
      {readiness.ready ? (
        <p className="mt-2 text-sm text-green-700">{t("readinessReady")}</p>
      ) : (
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/agent">{t("readinessCta")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
```

Note: `getMyAgent` returns the drizzle row (or `null`) and `listMine` returns rows with `revokedAt: Date | null` and `taskTypeAllowlist: string[]` — both structurally match `ReadinessAgent` / `ReadinessCommission` from Task 1, no mapping needed.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean. (If `lucide-react` icon names fail, the project already uses lucide icons — check an existing import, e.g. `grep -rn "lucide-react" src/components | head -3`, and match its style.)

- [ ] **Step 3: Commit**

```bash
git add src/components/hackathon/briefing/agent-readiness-checklist.tsx
git commit -m "feat(hackathon): agent readiness checklist island"
```

---

### Task 5: `HackathonBriefing` server component

**Files:**
- Create: `src/components/hackathon/briefing/hackathon-briefing.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/hackathon/briefing/hackathon-briefing.tsx
// Pre-lock "digital opening ceremony" (spec 2026-06-11): what the grid will
// be, how scoring works, agent setup + relevant tool catalog, and where to get
// help — rendered by the team page while no competitive grid exists.
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CatalogGroup } from "@/server/mcp/catalog-meta";
import type { CellTemplate } from "@/server/hackathon/cell-template";
import { ToolCatalogList } from "@/components/agents/tool-catalog-list";
import { ConnectAgentPanel } from "@/components/hackathon/workspace/connect-agent-panel";
import { AgentReadinessChecklist } from "./agent-readiness-checklist";

export async function HackathonBriefing({
  eventSlug,
  challengeId,
  challengeSlug,
  cellTemplate,
  rankingMode,
  xpReward,
  badgeReward,
  members,
  teamName,
  catalogGroups,
}: {
  eventSlug: string;
  challengeId: number;
  challengeSlug: string;
  cellTemplate: CellTemplate;
  rankingMode: "speed" | "thoroughness" | "collaboration";
  xpReward: number;
  badgeReward: string | null;
  members: { userId: string; displayName: string }[];
  teamName: string;
  catalogGroups: CatalogGroup[];
}) {
  const t = await getTranslations("hackathon.briefing");

  const tiebreakKey = {
    speed: "tiebreakSpeed",
    thoroughness: "tiebreakThoroughness",
    collaboration: "tiebreakCollaboration",
  } as const satisfies Record<typeof rankingMode, string>;

  const requiredTaskTypes = [...new Set(cellTemplate.map((c) => c.taskType))];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          {t("subtitle")}
        </p>
      </div>

      {/* 1 — The plan */}
      <Card>
        <CardHeader>
          <CardTitle>{t("planTitle")}</CardTitle>
          <CardDescription>{t("planIntro")}</CardDescription>
        </CardHeader>
        <CardContent>
          {cellTemplate.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("planEmpty")}</p>
          ) : (
            <ul className="divide-border divide-y">
              {cellTemplate.map((cell, i) => (
                <li key={i} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <code className="font-mono text-xs font-semibold">
                      {cell.taskType}
                    </code>
                    <span className="text-muted-foreground font-mono text-[10px] uppercase">
                      {t("verifiedBy", { mode: cell.verificationMode })}
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px] uppercase">
                      {t("deadline", { minutes: cell.deadlineMinutes })}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {cell.description}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <h4 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-widest uppercase">
              / {t("rosterTitle")} — {teamName}
            </h4>
            <p className="mt-1 text-sm">
              {members.map((m) => m.displayName).join(", ")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 2 — How you win */}
      <Card>
        <CardHeader>
          <CardTitle>{t("scoringTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{t("scoringBody")}</p>
          <p className="text-muted-foreground">{t(tiebreakKey[rankingMode])}</p>
          {xpReward > 0 ? <p>{t("prizeXp", { xp: xpReward })}</p> : null}
          {badgeReward ? <p>{t("prizeBadge", { badge: badgeReward })}</p> : null}
        </CardContent>
      </Card>

      {/* 3 — Work with your agent */}
      <Card>
        <CardHeader>
          <CardTitle>{t("agentTitle")}</CardTitle>
          <CardDescription>{t("agentIntro")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("attribution")}</p>
          <AgentReadinessChecklist requiredTaskTypes={requiredTaskTypes} />
          <ConnectAgentPanel challengeId={challengeId} />
          <div>
            <h4 className="text-sm font-semibold">{t("toolsTitle")}</h4>
            <p className="text-muted-foreground text-sm">{t("toolsIntro")}</p>
            <ToolCatalogList groups={catalogGroups} />
            <div className="mt-4">
              <Button asChild size="sm" variant="outline">
                <Link href="/agents">{t("fullCatalog")}</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 — Get help */}
      <Card>
        <CardHeader>
          <CardTitle>{t("helpTitle")}</CardTitle>
          <CardDescription>{t("helpBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/challenges/${challengeSlug}`}>
              {t("helpChallenge")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/events/${eventSlug}`}>{t("helpEvent")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean. (`ConnectAgentPanel` is a client component imported by a server component — that's the standard server→client boundary, already how `TeamWorkspace` children work.)

- [ ] **Step 3: Commit**

```bash
git add src/components/hackathon/briefing/hackathon-briefing.tsx
git commit -m "feat(hackathon): pre-lock briefing server component"
```

---

### Task 6: Page detection branch

**Files:**
- Modify: `src/app/[locale]/events/[slug]/team/page.tsx`

- [ ] **Step 1: Add the pre-lock branch**

After the enrollment gate and `memberRows`/`members` assembly (keep all existing code), and before the `return <TeamWorkspace …/>`, insert the grid-existence check; render the briefing when no competitive grid exists.

Add imports at the top:

```tsx
import { workGrids, teams } from "@/server/db/schema";
import { cellTemplateSchema } from "@/server/hackathon/cell-template";
import { getToolCatalog } from "@/server/mcp/catalog";
import { groupBySurface } from "@/server/mcp/catalog-meta";
import { HackathonBriefing } from "@/components/hackathon/briefing/hackathon-briefing";
```

(`and`, `eq`, `isNotNull`, `inArray` are already imported from drizzle-orm; `challengeEnrollments`, `memberProfiles` already imported.)

Insert before the final `return`:

```tsx
  // Pre-lock: no competitive grid yet (the same condition requireTeamGridId
  // enforces) → render the briefing instead of the live workspace.
  const [grid] = await db
    .select({ id: workGrids.id })
    .from(workGrids)
    .where(
      and(eq(workGrids.teamId, teamId), eq(workGrids.mode, "competitive")),
    )
    .limit(1);

  if (!grid) {
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    const challenge = await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
    const parsed = cellTemplateSchema.safeParse(challenge.cellTemplate ?? []);
    const cellTemplate = parsed.success ? parsed.data : [];
    const rankingMode =
      challenge.rankingMode === "thoroughness" ||
      challenge.rankingMode === "collaboration"
        ? challenge.rankingMode
        : "speed";
    const rewards = challenge.rewards as
      | { xpReward?: number; badgeReward?: string }
      | undefined;

    const BRIEFING_SURFACES = ["commissions", "challenges", "inbox"];
    const catalogGroups = groupBySurface(await getToolCatalog()).filter((g) =>
      BRIEFING_SURFACES.includes(g.surface),
    );

    return (
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
        <HackathonBriefing
          eventSlug={slug}
          challengeId={challengeId}
          challengeSlug={challenge.slug ?? ""}
          cellTemplate={cellTemplate}
          rankingMode={rankingMode}
          xpReward={rewards?.xpReward ?? 0}
          badgeReward={rewards?.badgeReward ?? null}
          members={members}
          teamName={team?.name ?? ""}
          catalogGroups={catalogGroups}
        />
      </div>
    );
  }
```

- [ ] **Step 2: Verify types and tests**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean; full vitest suite passes (DB-integration suites auto-skip).

If `challenge.rankingMode` / `challenge.cellTemplate` / `challenge.slug` aren't on the generated Payload type, check `src/payload-types.ts` for the `Challenge` type field names — they exist in the collection (`src/collections/Challenges.ts:360` `rankingMode`) and are used the same way in `src/server/api/routers/hackathon.ts` (`finalizeHackathon`); mirror that file's access pattern exactly.

- [ ] **Step 3: Manual verification against the live pre-lock event**

The dev DB currently has exactly this state: event `test-e-1781069637721`, challenge 9, both teams `forming`, no grids, a 2-entry `cellTemplate`.

Run: dev server already running — open `http://localhost:3000/en/events/test-e-1781069637721/team` as `greg@klevox.com`.
Expected: the briefing renders (2 tasks in "The plan", scoring card, readiness checklist with real check states, commissions/challenges/inbox tool groups, help links). No `teamWorkspace.cells` NOT_FOUND errors in the server log (the briefing branch never mounts the heatmap).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/events/[slug]/team/page.tsx"
git commit -m "feat(hackathon): render pre-lock briefing when no competitive grid exists"
```

---

### Task 7: Full verification pass

- [ ] **Step 1: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean/passing (lint may surface unused-import leftovers from Task 2's page edit — fix any).

- [ ] **Step 2: Post-lock smoke check**

Lock rosters as the operator (UI: `/en/communities/demo-community/events/test-e-1781069637721/manage` → "Lock rosters"), then reload the team page.
Expected: the live `TeamWorkspace` (heatmap with 2 cells) renders — the briefing branch is skipped because the grid now exists.

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "fix(hackathon): briefing verification fixups" # only if needed
```
