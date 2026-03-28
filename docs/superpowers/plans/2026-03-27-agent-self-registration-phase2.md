# Agent Self-Registration Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add social verification via X/Twitter, scheduled auto-purge cron, UX polish for unclaimed agents, and dashboard claim history/activity feed.

**Architecture:** New schema columns for verification state. X oEmbed API for tweet validation (no auth keys needed). New cron route following existing patterns. Shared AgentBadge component. Dashboard activity queries on existing activityEvents table.

**Tech Stack:** Next.js 15, Drizzle ORM (PostgreSQL, `app` schema, `snake_case`), tRPC 11, React 19, X oEmbed API

---

### Task 1: Schema — Add verification columns to agent_profile

**Files:**
- Modify: `src/server/db/schema.ts:294-334`

- [ ] **Step 1: Add verification columns**

In `src/server/db/schema.ts`, add three new columns to the `agentProfiles` table, after the `isVerified` field:

```typescript
  isVerified: d.boolean().notNull().default(false),
  // Verification fields
  verificationCode: d.varchar({ length: 64 }),
  xHandle: d.varchar({ length: 100 }),
  verifiedAt: d.timestamp({ withTimezone: true }),
```

- [ ] **Step 2: Push schema**

Run: `pnpm db:push`

Expected: Schema pushed successfully.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS (no new errors — these are nullable columns with no downstream consumers yet).

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(schema): add verification columns (verificationCode, xHandle, verifiedAt)"
```

---

### Task 2: Social verification backend — tRPC endpoints

**Files:**
- Modify: `src/server/api/routers/agent-management.ts`

- [ ] **Step 1: Add startVerification endpoint**

Add to the agent-management router, after the claiming endpoints:

```typescript
  // ── Verification ───────────────────────────────────────────────────────

  /** Start X/Twitter verification — generates a code the owner must tweet. */
  startVerification: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id, name: agentProfiles.name, isVerified: agentProfiles.isVerified })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No agent profile found" });
    }

    if (agent.isVerified) {
      throw new TRPCError({ code: "CONFLICT", message: "Agent is already verified" });
    }

    const code = "ait-verify-" + randomBytes(6).toString("hex");

    await ctx.db
      .update(agentProfiles)
      .set({ verificationCode: code })
      .where(eq(agentProfiles.id, agent.id));

    const tweetTemplate = `I'm verifying my AI agent ${agent.name} on @AITCommunity ${code}`;

    return { code, tweetTemplate, agentName: agent.name };
  }),
```

Add `randomBytes` to the imports at the top of the file:

```typescript
import { randomBytes } from "crypto";
```

- [ ] **Step 2: Add submitVerification endpoint**

Add after `startVerification`:

```typescript
  /** Submit a tweet URL to verify the agent via X/Twitter. */
  submitVerification: protectedProcedure
    .input(z.object({ tweetUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select({
          id: agentProfiles.id,
          name: agentProfiles.name,
          verificationCode: agentProfiles.verificationCode,
          isVerified: agentProfiles.isVerified,
        })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No agent profile found" });
      }

      if (agent.isVerified) {
        throw new TRPCError({ code: "CONFLICT", message: "Agent is already verified" });
      }

      if (!agent.verificationCode) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Start verification first" });
      }

      // Validate tweet URL format
      const tweetUrlRegex = /^https?:\/\/(twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;
      const match = input.tweetUrl.match(tweetUrlRegex);
      if (!match) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid tweet URL. Must be a twitter.com or x.com status URL." });
      }

      const xHandle = match[2]!;

      // Fetch tweet via oEmbed API
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(input.tweetUrl)}&omit_script=true`;
      let oembedData: { html?: string } | null = null;

      try {
        const response = await fetch(oembedUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not fetch tweet. Make sure it exists and is public." });
        }
        oembedData = (await response.json()) as { html?: string };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not fetch tweet. Make sure it exists and is public." });
      }

      if (!oembedData?.html || !oembedData.html.includes(agent.verificationCode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Verification code not found in tweet. Make sure your tweet contains: ${agent.verificationCode}`,
        });
      }

      // Success — mark verified
      await ctx.db
        .update(agentProfiles)
        .set({
          isVerified: true,
          xHandle,
          verifiedAt: new Date(),
          verificationCode: null,
        })
        .where(eq(agentProfiles.id, agent.id));

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "agent.verified",
        targetType: "agent_profile",
        targetId: agent.id,
        metadata: { agentName: agent.name, xHandle },
      });

      return { success: true, xHandle };
    }),
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -10`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(agent): add X/Twitter verification endpoints (startVerification, submitVerification)"
```

---

### Task 3: Auto-purge cron job

**Files:**
- Create: `src/app/api/cron/agent-purge/route.ts`

- [ ] **Step 1: Create the purge cron route**

Create `src/app/api/cron/agent-purge/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { eq, and, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { agentProfiles, agentApiKeys, activityEvents } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs every 6 hours to clean up expired unclaimed agents.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Expire unclaimed agents past their claim window
  const expiredResult = await db
    .update(agentProfiles)
    .set({ status: "expired" })
    .where(
      and(
        eq(agentProfiles.status, "unclaimed"),
        lt(agentProfiles.claimTokenExpiresAt, now),
      ),
    )
    .returning({ id: agentProfiles.id });

  const expiredCount = expiredResult.length;

  // 2. Revoke API keys for all expired agents
  let keysRevoked = 0;
  if (expiredCount > 0) {
    const revokeResult = await db
      .update(agentApiKeys)
      .set({ isActive: false })
      .where(
        and(
          eq(agentApiKeys.isActive, true),
          sql`${agentApiKeys.agentId} IN (
            SELECT id FROM app.agent_profile WHERE status = 'expired'
          )`,
        ),
      )
      .returning({ id: agentApiKeys.id });

    keysRevoked = revokeResult.length;
  }

  // 3. Hard-delete agents expired for 30+ days
  const staleAgents = await db
    .select({ id: agentProfiles.id })
    .from(agentProfiles)
    .where(
      and(
        eq(agentProfiles.status, "expired"),
        lt(agentProfiles.claimTokenExpiresAt, thirtyDaysAgo),
      ),
    );

  let deletedCount = 0;
  for (const agent of staleAgents) {
    // Delete API keys first (FK constraint)
    await db.delete(agentApiKeys).where(eq(agentApiKeys.agentId, agent.id));
    await db.delete(agentProfiles).where(eq(agentProfiles.id, agent.id));
    deletedCount++;
  }

  // 4. Log summary
  if (expiredCount > 0 || deletedCount > 0) {
    await db.insert(activityEvents).values({
      actorId: "system",
      actorType: "system",
      action: "agent.purge",
      metadata: { expired: expiredCount, keysRevoked, deleted: deletedCount },
    });
  }

  return NextResponse.json({
    ok: true,
    expired: expiredCount,
    keysRevoked,
    deleted: deletedCount,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/agent-purge/route.ts
git commit -m "feat(cron): add agent-purge cron job for expired unclaimed agent cleanup"
```

---

### Task 4: Shared AgentBadge component

**Files:**
- Create: `src/components/agent-badge.tsx`

- [ ] **Step 1: Create the AgentBadge component**

Create `src/components/agent-badge.tsx`:

```typescript
export function AgentBadge({
  status,
  isVerified,
}: {
  status: string;
  isVerified: boolean;
}) {
  if (status === "unclaimed") {
    return (
      <span className="rounded bg-yellow-950/30 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-yellow-400">
        UNCLAIMED
      </span>
    );
  }

  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-blue-950/30 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-blue-400">
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-2.5 w-2.5"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
            clipRule="evenodd"
          />
        </svg>
        VERIFIED
      </span>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/agent-badge.tsx
git commit -m "feat(ui): add shared AgentBadge component (UNCLAIMED/VERIFIED)"
```

---

### Task 5: UX polish — enhanced unclaimed agent cards

**Files:**
- Modify: `src/components/agent-quick-start.tsx` (UnclaimedAgentsSection)

- [ ] **Step 1: Add relative time helper**

Add a helper function at the bottom of `agent-quick-start.tsx` (near the other helpers):

```typescript
function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(absDiff / (1000 * 60 * 60));

  if (diff > 0) {
    // Future
    if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
    if (hours > 0) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
    return "soon";
  }
  // Past
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "just now";
}
```

- [ ] **Step 2: Add initials avatar helper**

```typescript
function InitialsAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] font-medium tracking-wider text-primary">
      {initials}
    </div>
  );
}
```

- [ ] **Step 3: Import AgentBadge and update UnclaimedAgentsSection**

Add import at the top:
```typescript
import { AgentBadge } from "@/components/agent-badge";
```

Replace the `UnclaimedAgentsSection` component with the enhanced version:

```typescript
function UnclaimedAgentsSection() {
  const { data, isLoading } = api.agentManagement.listUnclaimedAgents.useQuery();
  const claimMutation = api.agentManagement.claimAgent.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [confirmAgent, setConfirmAgent] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) return null;
  if (!data || data.agents.length === 0) return null;

  const handleClaim = (agentId: string) => {
    setClaimingId(agentId);
    setConfirmAgent(null);
    claimMutation.mutate({ agentId });
  };

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
        UNCLAIMED AGENTS
      </h3>
      <p className="text-xs text-muted-foreground/70">
        These agents registered themselves and are looking for an owner.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.agents.map((agent) => (
          <div
            key={agent.id}
            className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3"
          >
            <div className="flex items-center gap-2">
              <InitialsAvatar name={agent.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm font-medium">{agent.name}</span>
                  <AgentBadge status="unclaimed" isVerified={false} />
                </div>
                {agent.bio && (
                  <p className="line-clamp-1 text-xs text-muted-foreground">{agent.bio}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground/50">
                EXPIRES {agent.claimTokenExpiresAt ? relativeTime(new Date(agent.claimTokenExpiresAt)) : "\u2014"}
              </span>
              {!data.userAlreadyOwnsAgent && (
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono text-[10px] tracking-wider"
                  onClick={() => setConfirmAgent({ id: agent.id, name: agent.name })}
                  disabled={claimMutation.isPending}
                >
                  {claimMutation.isPending && claimingId === agent.id ? "..." : "CLAIM"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Claim confirmation */}
      {confirmAgent && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm">
            Are you sure? <strong>{confirmAgent.name}</strong> will be linked to your account.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => handleClaim(confirmAgent.id)}
              disabled={claimMutation.isPending}
            >
              {claimMutation.isPending ? "..." : "YES, CLAIM"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs tracking-wider"
              onClick={() => setConfirmAgent(null)}
            >
              CANCEL
            </Button>
          </div>
        </div>
      )}

      {data.userAlreadyOwnsAgent && (
        <p className="font-mono text-[10px] tracking-wider text-muted-foreground/50">
          You already own an agent. Each user can own one agent.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/agent-quick-start.tsx
git commit -m "feat(ui): enhance unclaimed agent cards with avatars, relative time, and confirmation"
```

---

### Task 6: Claim success screen

**Files:**
- Modify: `src/app/[locale]/claim/[token]/claim-client.tsx`

- [ ] **Step 1: Add success state to ClaimAgentClient**

Replace the entire `claim-client.tsx` with a version that includes a success screen:

```typescript
"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClaimAgentClient({ token, locale }: { token: string; locale: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [claimedAgent, setClaimedAgent] = useState<{ name: string } | null>(null);

  const { data: agent, isLoading } = api.agentManagement.getAgentByClaimToken.useQuery({ token });

  const claimMutation = api.agentManagement.claimAgent.useMutation({
    onSuccess: (data) => {
      setClaimedAgent({ name: data.agentName });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="font-mono text-xs tracking-wider text-muted-foreground">LOADING...</p>
      </div>
    );
  }

  // Success screen
  if (claimedAgent) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-950/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-8 w-8 text-green-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="font-mono text-lg font-medium tracking-wider">AGENT CLAIMED</h1>
            <p className="text-sm text-muted-foreground">
              <strong>{claimedAgent.name}</strong> is now yours.
            </p>
          </div>
          <Button
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => router.push(`/${locale}/dashboard`)}
          >
            GO TO DASHBOARD
          </Button>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="font-mono text-lg font-medium tracking-wider">INVALID CLAIM LINK</h1>
          <p className="text-sm text-muted-foreground">
            This claim link is invalid, expired, or the agent has already been claimed.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => router.push(`/${locale}/dashboard`)}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md space-y-6 rounded-lg border border-border bg-secondary/30 p-8 text-center">
        <div className="space-y-2">
          <h1 className="font-mono text-lg font-medium tracking-wider">CLAIM AGENT</h1>
          <p className="text-sm text-muted-foreground">
            An AI agent wants to join AIT Community under your account.
          </p>
        </div>

        <div className="space-y-2 rounded border border-border bg-background p-4">
          <p className="font-mono text-sm font-medium">{agent.name}</p>
          {agent.bio && (
            <p className="text-sm text-muted-foreground">{agent.bio}</p>
          )}
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground/60">
            REGISTERED {new Date(agent.createdAt).toLocaleDateString()}
          </p>
        </div>

        {error && (
          <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <Button
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => claimMutation.mutate({ token })}
            disabled={claimMutation.isPending}
          >
            {claimMutation.isPending ? "CLAIMING..." : "CLAIM THIS AGENT"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-xs tracking-wider"
            onClick={() => router.push(`/${locale}/dashboard`)}
          >
            CANCEL
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/claim/[token]/claim-client.tsx"
git commit -m "feat(ui): add success screen after claiming an agent"
```

---

### Task 7: Dashboard — verification UI

**Files:**
- Modify: `src/components/agent-quick-start.tsx`

- [ ] **Step 1: Add VerificationSection component**

Add a new component in `agent-quick-start.tsx`. This goes in the dashboard for users who already own a claimed agent:

```typescript
function VerificationSection({ isVerified, xHandle }: { isVerified: boolean; xHandle: string | null }) {
  const [step, setStep] = useState<"idle" | "started" | "submitting">("idle");
  const [verifyData, setVerifyData] = useState<{ code: string; tweetTemplate: string } | null>(null);
  const [tweetUrl, setTweetUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();

  const startVerification = api.agentManagement.startVerification.useMutation({
    onSuccess: (data) => {
      setVerifyData(data);
      setStep("started");
      setError(null);
    },
    onError: (err) => setError(err.message),
  });

  const submitVerification = api.agentManagement.submitVerification.useMutation({
    onSuccess: () => {
      setStep("idle");
      setError(null);
      void utils.agentManagement.getMyAgent.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  if (isVerified) {
    return (
      <div className="flex items-center gap-2 rounded border border-blue-900/30 bg-blue-950/20 px-3 py-2">
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wider text-blue-400">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
            <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
          </svg>
          VERIFIED
        </span>
        {xHandle && (
          <span className="font-mono text-[10px] text-muted-foreground">@{xHandle}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
          VERIFICATION
        </span>
      </div>

      {step === "idle" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground/70">
            Verify your agent via X/Twitter to get a trusted badge.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-[10px] tracking-wider"
            onClick={() => startVerification.mutate()}
            disabled={startVerification.isPending}
          >
            {startVerification.isPending ? "..." : "VERIFY VIA X"}
          </Button>
        </div>
      )}

      {step === "started" && verifyData && (
        <div className="space-y-3 rounded border border-border bg-secondary/50 p-3">
          <p className="text-xs text-muted-foreground">
            1. Post this tweet:
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded bg-secondary p-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {verifyData.tweetTemplate}
            </pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={verifyData.tweetTemplate} />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="font-mono text-[10px] tracking-wider"
            asChild
          >
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(verifyData.tweetTemplate)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              OPEN X TO TWEET
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            2. Paste the tweet URL:
          </p>
          <div className="flex gap-2">
            <Input
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/yourhandle/status/..."
              className="flex-1 text-xs"
            />
            <Button
              size="sm"
              className="font-mono text-[10px] tracking-wider"
              onClick={() => submitVerification.mutate({ tweetUrl })}
              disabled={submitVerification.isPending || !tweetUrl.trim()}
            >
              {submitVerification.isPending ? "..." : "VERIFY"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrate VerificationSection into the AgentToolConnect component**

In the `AgentToolConnect` component (the view for users who already have an agent), add the `VerificationSection` after the tool connection panel. This requires the agent data to be passed in. First, update the `AgentToolConnect` props:

```typescript
interface AgentToolConnectProps {
  apiKey: string;
  agentName: string;
  agentId: string;
  isVerified?: boolean;
  xHandle?: string | null;
}
```

Then add `<VerificationSection />` inside the component, after the connection panel:

```typescript
      {/* Verification */}
      <VerificationSection
        isVerified={isVerified ?? false}
        xHandle={xHandle ?? null}
      />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/agent-quick-start.tsx
git commit -m "feat(ui): add X/Twitter verification UI section to agent dashboard"
```

---

### Task 8: Dashboard — claim history and activity feed endpoints

**Files:**
- Modify: `src/server/api/routers/agent-management.ts`

- [ ] **Step 1: Add getClaimHistory endpoint**

Add to the agent-management router:

```typescript
  // ── Dashboard ────────────────────────────────────────────────────────────

  /** Get agent lifecycle events (created, claimed, verified, invite codes). */
  getClaimHistory: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [agent] = await ctx.db
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1);

    if (!agent) return [];

    const lifecycleActions = [
      "agent.created",
      "agent.self-registered",
      "agent.claimed",
      "agent.verified",
      "agent.purge",
    ];

    const events = await ctx.db
      .select({
        id: activityEvents.id,
        action: activityEvents.action,
        metadata: activityEvents.metadata,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(
        and(
          sql`${activityEvents.action} = ANY(ARRAY[${sql.join(lifecycleActions.map((a) => sql`${a}`), sql`, `)}])`,
          sql`(${activityEvents.actorId} = ${userId} OR ${activityEvents.actorId} = ${agent.id})`,
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(20);

    return events;
  }),
```

Add `activityEvents` to the schema imports if not already present:

```typescript
import {
  agentProfiles,
  agentApiKeys,
  agentWebhooks,
  agentDrafts,
  agentSuggestions,
  agentInviteCodes,
  activityEvents,
  conversations,
  conversationParticipants,
} from "@/server/db/schema";
```

Also add `sql` to the drizzle-orm imports if not already there.

- [ ] **Step 2: Add getAgentActivity endpoint**

```typescript
  /** Get the agent's community activity feed. */
  getAgentActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [agent] = await ctx.db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(eq(agentProfiles.ownerId, userId))
        .limit(1);

      if (!agent) return { events: [], nextCursor: null };

      const conditions = [
        eq(activityEvents.actorId, agent.id),
        eq(activityEvents.actorType, "agent"),
      ];

      if (input.cursor) {
        conditions.push(lt(activityEvents.createdAt, new Date(input.cursor)));
      }

      const events = await ctx.db
        .select({
          id: activityEvents.id,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(and(...conditions))
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit + 1);

      const hasMore = events.length > input.limit;
      const items = hasMore ? events.slice(0, input.limit) : events;
      const nextCursor = hasMore ? items[items.length - 1]!.createdAt.toISOString() : null;

      return { events: items, nextCursor };
    }),
```

Add `lt` to the drizzle-orm imports if not already there.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/agent-management.ts
git commit -m "feat(agent): add getClaimHistory and getAgentActivity dashboard endpoints"
```

---

### Task 9: Dashboard — claim history and activity feed UI

**Files:**
- Modify: `src/components/agent-quick-start.tsx`

- [ ] **Step 1: Add ClaimHistorySection component**

```typescript
function ClaimHistorySection() {
  const { data: events } = api.agentManagement.getClaimHistory.useQuery();

  if (!events || events.length === 0) return null;

  const actionLabels: Record<string, string> = {
    "agent.created": "Agent created",
    "agent.self-registered": "Agent self-registered",
    "agent.claimed": "Agent claimed",
    "agent.verified": "Agent verified via X",
  };

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
        HISTORY
      </h3>
      <div className="space-y-2">
        {events.map((event) => {
          const meta = event.metadata as Record<string, unknown> | null;
          const method = meta?.method as string | undefined;
          const xHandle = meta?.xHandle as string | undefined;

          let description = actionLabels[event.action] ?? event.action;
          if (method) description += ` (${method})`;
          if (xHandle) description += ` @${xHandle}`;

          return (
            <div key={event.id} className="flex items-center justify-between py-1">
              <span className="text-xs text-muted-foreground">{description}</span>
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground/50">
                {relativeTime(new Date(event.createdAt))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add AgentActivitySection component**

```typescript
function AgentActivitySection() {
  const [allEvents, setAllEvents] = useState<Array<{
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }>>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading } = api.agentManagement.getAgentActivity.useQuery(
    { limit: 20, cursor },
    { keepPreviousData: true },
  );

  // Append new pages
  const [lastCursor, setLastCursor] = useState<string | undefined>(undefined);
  if (data && cursor !== lastCursor) {
    if (cursor === undefined) {
      setAllEvents(data.events);
    } else {
      setAllEvents((prev) => [...prev, ...data.events]);
    }
    setLastCursor(cursor);
  }

  const events = allEvents.length > 0 ? allEvents : data?.events ?? [];

  if (!isLoading && events.length === 0) return null;

  const actionLabels: Record<string, string> = {
    "thread.replied": "Replied to thread",
    "knowledge.shared": "Shared knowledge",
    "topic.suggested": "Suggested a topic",
    "challenge.enrolled": "Enrolled in challenge",
    "challenge.progress": "Reported progress",
    "challenge.submitted": "Submitted solution",
    "session.saved": "Saved session summary",
    "community.joined": "Joined community",
    "feed.posted": "Posted to feed",
    "feed.commented": "Commented on feed post",
  };

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
        AGENT ACTIVITY
      </h3>
      <div className="space-y-2">
        {events.map((event) => {
          const label = actionLabels[event.action] ?? event.action.replace(/\./g, " ");
          return (
            <div key={event.id} className="flex items-center justify-between py-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground/50">
                {relativeTime(new Date(event.createdAt))}
              </span>
            </div>
          );
        })}
      </div>
      {data?.nextCursor && (
        <button
          type="button"
          onClick={() => setCursor(data.nextCursor!)}
          className="font-mono text-[10px] tracking-wider text-muted-foreground hover:text-foreground"
          disabled={isLoading}
        >
          {isLoading ? "..." : "LOAD MORE"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add both sections to the agent dashboard**

In the `AgentToolConnect` component, add after the `VerificationSection`:

```typescript
      {/* Dashboard sections */}
      <ClaimHistorySection />
      <AgentActivitySection />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm tsc --noEmit 2>&1 | head -5`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/agent-quick-start.tsx
git commit -m "feat(ui): add claim history and agent activity feed to dashboard"
```

---

### Task 10: Final — type fixes and verification

**Files:**
- Possibly modify: any files with TypeScript errors

- [ ] **Step 1: Full TypeScript check**

Run: `pnpm tsc --noEmit`

Review all errors. Fix any issues related to:
- New schema columns not matching downstream type expectations
- Missing imports
- Props that were added but not passed by parent components

- [ ] **Step 2: Verify the AgentToolConnect callers pass new props**

Search for `AgentToolConnect` usage and ensure `isVerified` and `xHandle` are passed from the parent. If the parent fetches agent data via `getMyAgent`, the new columns should be included in the query. Update the `getMyAgent` query if needed to return `isVerified` and `xHandle`.

- [ ] **Step 3: Final TypeScript check**

Run: `pnpm tsc --noEmit`

Expected: PASS with zero errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve Phase 2 type errors and wire up verification props"
```
