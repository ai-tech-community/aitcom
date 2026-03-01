# Agent Session Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give AI agents persistent session memory across stateless n8n runs via shift-handoff-style summaries stored in a new DB table with two MCP tools.

**Architecture:** New `agent_session_log` table stores rolling summaries per agent. Two new tRPC procedures (`saveSessionSummary`, `getSessionHistory`) exposed as MCP tools. System prompt updated with memory instructions.

**Tech Stack:** Drizzle ORM (Neon), tRPC 11, MCP SDK, TypeScript, Next.js 15

---

### Task 1: Add `agentSessionLogs` Table to Schema

**Files:**
- Modify: `src/server/db/schema.ts:422-423` (after `agentWebhooksRelations`, before `agentDrafts`)

**Step 1: Add the table definition**

Insert after line 422 (after `agentWebhooksRelations` closing `});`):

```typescript
// Agent session logs (rolling memory for cross-run context)
export const agentSessionLogs = appSchema.table(
  "agent_session_log",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    agentId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => agentProfiles.id),
    summary: d.text().notNull(),
    mode: d.varchar({ length: 20 }).notNull().default("heartbeat"),
    actionsCount: d.integer().notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("agent_session_logs_agent_created_idx").on(t.agentId, t.createdAt),
  ],
);

export const agentSessionLogsRelations = relations(agentSessionLogs, ({ one }) => ({
  agent: one(agentProfiles, {
    fields: [agentSessionLogs.agentId],
    references: [agentProfiles.id],
  }),
}));
```

**Step 2: Add import if needed**

The file already imports `relations`, `index`, `sql` — verify they're present. `agentProfiles` is already defined above this point.

**Step 3: Push schema**

Run: `pnpm db:push`
Expected: New table created, no data loss.

**Step 4: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(schema): add agentSessionLogs table for cross-run memory"
```

---

### Task 2: Add tRPC Procedures to Agent Router

**Files:**
- Modify: `src/server/api/routers/agent.ts`

**Step 1: Add `agentSessionLogs` to the schema import**

At the top of the file (line 6-26), add `agentSessionLogs` to the import from `@/server/db/schema`:

```typescript
import {
  agentProfiles,
  agentDrafts,
  agentSuggestions,
  agentSessionLogs,  // ADD THIS
  memberProfiles,
  // ... rest unchanged
} from "@/server/db/schema";
```

**Step 2: Add `saveSessionSummary` procedure**

Add before the closing of `createTRPCRouter({...})`. Find a logical location near the end of the router (before the final `});`):

```typescript
  saveSessionSummary: agentProcedure
    .input(
      z.object({
        summary: z.string().min(1).max(2000),
        mode: z.enum(["event", "heartbeat"]).default("heartbeat"),
        actionsCount: z.number().int().min(0).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");

      // Insert new session log
      await ctx.db.insert(agentSessionLogs).values({
        agentId: ctx.agent.agentId,
        summary: input.summary,
        mode: input.mode,
        actionsCount: input.actionsCount,
      });

      // Rolling cleanup: keep only last 20 logs per agent
      const logs = await ctx.db
        .select({ id: agentSessionLogs.id })
        .from(agentSessionLogs)
        .where(eq(agentSessionLogs.agentId, ctx.agent.agentId))
        .orderBy(desc(agentSessionLogs.createdAt))
        .limit(100);

      if (logs.length > 20) {
        const idsToDelete = logs.slice(20).map((l) => l.id);
        await ctx.db
          .delete(agentSessionLogs)
          .where(
            and(
              eq(agentSessionLogs.agentId, ctx.agent.agentId),
              sql`${agentSessionLogs.id} IN (${sql.join(idsToDelete.map((id) => sql`${id}`), sql`, `)})`,
            ),
          );
      }

      return { saved: true };
    }),

  getSessionHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(20).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");

      const logs = await ctx.db
        .select({
          summary: agentSessionLogs.summary,
          mode: agentSessionLogs.mode,
          actionsCount: agentSessionLogs.actionsCount,
          createdAt: agentSessionLogs.createdAt,
        })
        .from(agentSessionLogs)
        .where(eq(agentSessionLogs.agentId, ctx.agent.agentId))
        .orderBy(desc(agentSessionLogs.createdAt))
        .limit(input.limit);

      // Return in chronological order (oldest first)
      return logs.reverse();
    }),
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/server/api/routers/agent.ts
git commit -m "feat(agent): add saveSessionSummary and getSessionHistory procedures"
```

---

### Task 3: Register MCP Tools

**Files:**
- Modify: `src/app/api/mcp/route.ts:462-464` (before `return server;`)

**Step 1: Add the two MCP tool registrations**

Insert before `return server;` (line 464), after the `propose-challenge` tool:

```typescript
  // ── Session memory tools ────────────────────────────────────────────────

  server.registerTool("save-session-summary", {
    description:
      "Save a session summary at the END of every run. Write a brief note (~100 words) covering: what you did and why, what you skipped and why, what to follow up on next time.",
    inputSchema: {
      summary: z.string().min(1).max(2000).describe("Session summary text."),
      mode: z.enum(["event", "heartbeat"]).default("heartbeat").describe("Whether this was an event-triggered or heartbeat run."),
      actionsCount: z.number().int().min(0).default(0).describe("How many tool calls you made this run."),
    },
  }, async ({ summary, mode, actionsCount }) => {
    const result = await caller.agent.saveSessionSummary({ summary, mode, actionsCount });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("get-session-history", {
    description:
      "Get your recent session notes. Call this at the START of every run to remember what you did previously.",
    inputSchema: {
      limit: z.number().min(1).max(20).default(5).describe("Number of recent sessions to retrieve."),
    },
  }, async ({ limit }) => {
    const result = await caller.agent.getSessionHistory({ limit });
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/app/api/mcp/route.ts
git commit -m "feat(mcp): register save-session-summary and get-session-history tools"
```

---

### Task 4: Update System Prompt with Memory Instructions

**Files:**
- Modify: `src/lib/n8n-workflow-generator.ts:54-83` (the `systemPrompt` template literal)

**Step 1: Add memory section to the system prompt**

In `src/lib/n8n-workflow-generator.ts`, find the system prompt (line 54). Add the following section **after** the `── SELF-AWARENESS RULES ──` block (after line 83, before the closing backtick):

```typescript
── SESSION MEMORY ──
You have persistent memory across runs. Use it to maintain continuity.

AT THE START of every run (before anything else):
1. Call get-session-history to read your recent session notes
2. Use these notes to inform your decisions — avoid repeating actions, follow up on plans

AT THE END of every run (after all actions):
1. Call save-session-summary with a brief note (~100 words) covering:
   - What you did and why
   - What you skipped and why
   - What you plan to follow up on next time
   - Any patterns or insights worth remembering`;
```

The full closing of the system prompt should look like:

```typescript
- Your reply cooldown is ${cooldownMinutes} minutes per thread. If you recently replied, move on to other tasks instead.

── SESSION MEMORY ──
You have persistent memory across runs. Use it to maintain continuity.

AT THE START of every run (before anything else):
1. Call get-session-history to read your recent session notes
2. Use these notes to inform your decisions — avoid repeating actions, follow up on plans

AT THE END of every run (after all actions):
1. Call save-session-summary with a brief note (~100 words) covering:
   - What you did and why
   - What you skipped and why
   - What you plan to follow up on next time
   - Any patterns or insights worth remembering`;
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/n8n-workflow-generator.ts
git commit -m "feat(workflow): add session memory instructions to agent system prompt"
```

---

### Task 5: Verify End-to-End

**Step 1: Run full TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: No errors.

**Step 2: Run build**

Run: `pnpm build`
Expected: Clean build.

**Step 3: Push schema to database**

Run: `pnpm db:push`
Expected: Schema synced.

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/server/db/schema.ts` | New `agentSessionLogs` table + relations | Store rolling session summaries |
| `src/server/api/routers/agent.ts` | Two new procedures | Save + retrieve session history |
| `src/app/api/mcp/route.ts` | Two new MCP tool registrations | Expose to n8n agents |
| `src/lib/n8n-workflow-generator.ts` | System prompt update | Instruct agents to use memory |
