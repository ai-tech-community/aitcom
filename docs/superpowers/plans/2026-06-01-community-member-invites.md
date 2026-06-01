# Community Member Invites & Invite-Link 404 Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken `/invite/<code>` link (404), add a human-readable slug-based join link, and let community admins add a member by email with a chosen role — directly (existing accounts) or via an email-bound, single-use role-bearing link.

**Architecture:** One `/[locale]/invite/[token]` route backed by a single `redeemInvite({ token })` tRPC procedure that resolves **code-first, then slug**: a code is a policy-bypassing grant (honors `maxUses`/expiry/`target_email`, records referral attribution, may grant a role); a slug joins per the community's join policy as a plain member and is refused for `invite_only`. Member-management gains `addMemberByEmail` (existing accounts only) and `createRoleInvite` (email-bound, single-use). All branching logic lives in a pure, unit-tested `invite-policy.ts` module, matching this codebase's pure-function test convention (no DB integration tests exist). See [ADR-0019](../../adr/0019-community-invite-links-slug-vs-code.md) and the **Community invite** / **Role-bearing invite** glossary entries in [CONTEXT.md](../../../CONTEXT.md).

**Tech Stack:** Next.js App Router (`[locale]` i18n via next-intl), tRPC, Drizzle ORM (Postgres, `app` schema), Payload-style raw-SQL migrations, vitest, better-auth sessions, sonner toasts, shadcn UI.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/migrations/20260601b_invite_role_target_email.ts` | Add `role` + `target_email` columns to `community_invite` | Create |
| `src/migrations/index.ts` | Register the migration | Modify |
| `src/server/db/schema.ts` | Add the two columns to the `communityInvites` table def | Modify |
| `src/server/communities/invite-policy.ts` | Pure branching logic (slug-join status, role-from-invite, email-bind check) | Create |
| `src/server/communities/invite-policy.test.ts` | Unit tests for the pure logic | Create |
| `src/server/api/routers/communities.ts` | `redeemInvite`, `addMemberByEmail`, `createRoleInvite` procedures | Modify |
| `src/app/[locale]/invite/[token]/page.tsx` | Acceptance page (the 404 fix) | Create |
| `src/app/[locale]/join/[code]/page.tsx` | Redirect alias → `/invite/<code>` | Replace |
| `src/middleware.ts` | Add `/invite` to `protectedPaths` | Modify |
| `src/components/communities/settings/members-settings.tsx` | "Add member" form (email + role; add / generate-link) | Modify |
| `src/app/[locale]/communities/[slug]/settings/invites/page.tsx` | Pass `joinPolicy` to InvitesSettings | Modify |
| `src/components/communities/settings/invites-settings.tsx` | Show slug general link + role/target badges | Modify |
| `messages/en.json`, `messages/nl.json` | New translation keys | Modify |

---

## Task 1: Schema — add `role` and `target_email` to `community_invite`

**Files:**
- Create: `src/migrations/20260601b_invite_role_target_email.ts`
- Modify: `src/migrations/index.ts`
- Modify: `src/server/db/schema.ts:2515-2545` (the `communityInvites` table)

- [ ] **Step 1: Create the migration**

```ts
// src/migrations/20260601b_invite_role_target_email.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community_invite"
      ADD COLUMN IF NOT EXISTS "role" varchar(32);
    ALTER TABLE "app"."community_invite"
      ADD COLUMN IF NOT EXISTS "target_email" varchar(255);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community_invite" DROP COLUMN IF EXISTS "target_email";
    ALTER TABLE "app"."community_invite" DROP COLUMN IF EXISTS "role";
  `);
}
```

- [ ] **Step 2: Register the migration in `index.ts`**

Add the import alongside the others near the top of `src/migrations/index.ts`:

```ts
import * as migration_20260601b_invite_role_target_email from "./20260601b_invite_role_target_email";
```

Add this object as the **last** entry of the exported `migrations` array (right after the `20260601a_agent_manifest_acceptance` entry):

```ts
  {
    up: migration_20260601b_invite_role_target_email.up,
    down: migration_20260601b_invite_role_target_email.down,
    name: "20260601b_invite_role_target_email",
  },
```

- [ ] **Step 3: Add the columns to the Drizzle schema**

In `src/server/db/schema.ts`, inside the `communityInvites` table column object, add the two columns immediately after the `expiresAt` column and before `createdAt`:

```ts
    expiresAt: d.timestamp({ withTimezone: true }),
    role: d.varchar({ length: 32 }),
    targetEmail: d.varchar({ length: 255 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors referencing `communityInvites`, `role`, or `targetEmail`).

- [ ] **Step 5: Commit**

```bash
git add src/migrations/20260601b_invite_role_target_email.ts src/migrations/index.ts src/server/db/schema.ts
git commit -m "feat(invites): add role and target_email columns to community_invite"
```

---

## Task 2: Pure invite-policy logic (TDD)

**Files:**
- Create: `src/server/communities/invite-policy.ts`
- Test: `src/server/communities/invite-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/communities/invite-policy.test.ts
import { describe, it, expect } from "vitest";
import {
  slugJoinStatus,
  roleFromInvite,
  canRedeemInvite,
} from "./invite-policy";

describe("slugJoinStatus", () => {
  it("open communities join as active", () => {
    expect(slugJoinStatus("open")).toEqual({ ok: true, status: "active" });
  });
  it("approval_required communities join as pending_approval", () => {
    expect(slugJoinStatus("approval_required")).toEqual({
      ok: true,
      status: "pending_approval",
    });
  });
  it("invite_only communities refuse slug joins", () => {
    expect(slugJoinStatus("invite_only")).toEqual({
      ok: false,
      reason: "invite_only",
    });
  });
});

describe("roleFromInvite", () => {
  it("defaults null/undefined to member", () => {
    expect(roleFromInvite(null)).toBe("member");
    expect(roleFromInvite(undefined)).toBe("member");
  });
  it("returns the stored role when set", () => {
    expect(roleFromInvite("moderator")).toBe("moderator");
    expect(roleFromInvite("admin")).toBe("admin");
  });
});

describe("canRedeemInvite", () => {
  it("anyone may redeem an unbound invite (null targetEmail)", () => {
    expect(canRedeemInvite(null, "anyone@example.com")).toBe(true);
  });
  it("matches the bound email case- and whitespace-insensitively", () => {
    expect(canRedeemInvite("Person@Example.com", " person@example.com ")).toBe(
      true,
    );
  });
  it("rejects a mismatched email", () => {
    expect(canRedeemInvite("a@example.com", "b@example.com")).toBe(false);
  });
  it("rejects when the user has no email but the invite is bound", () => {
    expect(canRedeemInvite("a@example.com", null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/server/communities/invite-policy.test.ts`
Expected: FAIL — `Failed to resolve import "./invite-policy"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/server/communities/invite-policy.ts
import type { CommunityRole } from "./role-utils";

export type JoinPolicy = "open" | "invite_only" | "approval_required";

export type SlugJoinResult =
  | { ok: true; status: "active" | "pending_approval" }
  | { ok: false; reason: "invite_only" };

/**
 * Outcome of joining a community via its public slug link, per join policy.
 * `invite_only` is refused because a public slug is not a secret (ADR-0019).
 */
export function slugJoinStatus(joinPolicy: JoinPolicy): SlugJoinResult {
  switch (joinPolicy) {
    case "open":
      return { ok: true, status: "active" };
    case "approval_required":
      return { ok: true, status: "pending_approval" };
    case "invite_only":
      return { ok: false, reason: "invite_only" };
  }
}

/** The role an invite code grants; a null/absent role means a plain member. */
export function roleFromInvite(
  inviteRole: string | null | undefined,
): CommunityRole {
  return (inviteRole as CommunityRole | null | undefined) ?? "member";
}

/**
 * Whether a signed-in user may redeem a (possibly email-bound) invite code.
 * A null `targetEmail` means anyone may redeem; otherwise the user's email
 * must match case- and whitespace-insensitively (ADR-0019 role-bearing invite).
 */
export function canRedeemInvite(
  targetEmail: string | null | undefined,
  userEmail: string | null | undefined,
): boolean {
  if (!targetEmail) return true;
  if (!userEmail) return false;
  return (
    targetEmail.trim().toLowerCase() === userEmail.trim().toLowerCase()
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/server/communities/invite-policy.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/server/communities/invite-policy.ts src/server/communities/invite-policy.test.ts
git commit -m "feat(invites): pure invite-policy logic with unit tests"
```

---

## Task 3: `redeemInvite` procedure (code-first, slug-fallback)

**Files:**
- Modify: `src/server/api/routers/communities.ts` (add a new procedure next to `acceptInvite` near line 525)

> Context: `acceptInvite` ([communities.ts:430](../../../src/server/api/routers/communities.ts)) stays as-is for backward compatibility. `redeemInvite` is the new, enhanced entry point the `/invite/[token]` route uses. The imports it needs (`z`, `eq`, `and`, `isNull`, `sql`, `TRPCError`, `communities`, `communityMemberships`, `communityInvites`, `logActivity`, `protectedProcedure`) are already present at the top of the file.

- [ ] **Step 1: Add the import for the pure logic**

At the top of `src/server/api/routers/communities.ts`, next to the existing `import { canManageRole, ... } from ...` line, add:

```ts
import {
  slugJoinStatus,
  roleFromInvite,
  canRedeemInvite,
} from "@/server/communities/invite-policy";
```

- [ ] **Step 2: Add the `redeemInvite` procedure**

Insert this procedure immediately after the closing `}),` of `acceptInvite` (just before `leave:` at line 527):

```ts
  /** Resolve an invite token: a code (grant) first, else a community slug. */
  redeemInvite: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const userEmail = ctx.session.user.email ?? null;

      // --- 1. Code path: an opaque grant that bypasses join policy ---
      const invite = await ctx.db.query.communityInvites.findFirst({
        where: eq(communityInvites.code, input.token),
        with: { community: true },
      });

      if (invite) {
        if (invite.community.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
        }
        if (invite.expiresAt && invite.expiresAt < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
        }
        if (!canRedeemInvite(invite.targetEmail, userEmail)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This invite is reserved for a different email address",
          });
        }

        // Atomic max-uses guard (prevents race condition).
        if (invite.maxUses !== null) {
          const [updated] = await ctx.db
            .update(communityInvites)
            .set({ useCount: sql`${communityInvites.useCount} + 1` })
            .where(
              and(
                eq(communityInvites.id, invite.id),
                sql`${communityInvites.useCount} < ${invite.maxUses}`,
              ),
            )
            .returning();
          if (!updated) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invite has reached max uses",
            });
          }
        } else {
          await ctx.db
            .update(communityInvites)
            .set({ useCount: sql`${communityInvites.useCount} + 1` })
            .where(eq(communityInvites.id, invite.id));
        }

        const grantedRole = roleFromInvite(invite.role);
        const existing = await ctx.db.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, invite.communityId),
            eq(communityMemberships.userId, userId),
          ),
        });

        if (existing?.status === "banned") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are banned from this community",
          });
        }
        if (existing?.status === "active") {
          return { communitySlug: invite.community.slug, status: "active" as const };
        }
        if (existing) {
          await ctx.db
            .update(communityMemberships)
            .set({
              status: "active",
              role: grantedRole,
              invitedBy: existing.invitedBy ?? invite.createdBy,
            })
            .where(eq(communityMemberships.id, existing.id));
        } else {
          await ctx.db.insert(communityMemberships).values({
            communityId: invite.communityId,
            userId,
            role: grantedRole,
            status: "active",
            invitedBy: invite.createdBy,
          });
        }

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: "member",
          action: "community.joined",
          targetType: "community",
          targetId: invite.communityId,
          communityId: invite.communityId,
          metadata: { via: "invite", role: grantedRole },
        });

        return { communitySlug: invite.community.slug, status: "active" as const };
      }

      // --- 2. Slug path: a standing link that respects join policy ---
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.token),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite" });
      }

      const join = slugJoinStatus(community.joinPolicy);
      if (!join.ok) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This community is invite-only — you need an invite link",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
        ),
      });
      if (existing?.status === "banned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are banned from this community",
        });
      }
      if (existing?.status === "active") {
        return { communitySlug: community.slug, status: "active" as const };
      }
      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({ status: join.status })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: community.id,
          userId,
          role: "member",
          status: join.status,
        });
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action:
          join.status === "active"
            ? "community.joined"
            : "community.join_requested",
        targetType: "community",
        targetId: community.id,
        communityId: community.id,
        metadata: { via: "slug_link" },
      });

      return { communitySlug: community.slug, status: join.status };
    }),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (If `ctx.session.user.email` is typed as `string` rather than `string | null`, the `?? null` is harmless.)

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(invites): redeemInvite resolves code then slug per join policy"
```

---

## Task 4: `addMemberByEmail` procedure (existing accounts only)

**Files:**
- Modify: `src/server/api/routers/communities.ts` (add after `inviteMember`, near line 1153, before the final `});`)

> Context: `communityProcedure` injects `ctx.community`, `ctx.communityRole`, `ctx.session`. `user` table and `canManageRole`/`CommunityRole` are already imported.

- [ ] **Step 1: Add the procedure**

Insert immediately after the `inviteMember` procedure's closing `}),` (line 1153):

```ts
  /** Add an existing AIT account to the community with a chosen role */
  addMemberByEmail: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "moderator", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || !canManageRole(ctx.communityRole, input.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const email = input.email.trim().toLowerCase();
      const targetUser = await ctx.db.query.user.findFirst({
        where: sql`lower(${user.email}) = ${email}`,
      });
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No AIT account with that email. Send them an invite link instead.",
        });
      }

      const existing = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, targetUser.id),
        ),
      });
      if (existing?.status === "active") {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }
      if (existing?.status === "banned") {
        throw new TRPCError({ code: "FORBIDDEN", message: "User is banned" });
      }

      if (existing) {
        await ctx.db
          .update(communityMemberships)
          .set({
            status: "active",
            role: input.role,
            invitedBy: ctx.session.user.id,
          })
          .where(eq(communityMemberships.id, existing.id));
      } else {
        await ctx.db.insert(communityMemberships).values({
          communityId: ctx.community.id,
          userId: targetUser.id,
          role: input.role,
          status: "active",
          invitedBy: ctx.session.user.id,
        });
      }

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.joined",
        targetType: "community",
        targetId: ctx.community.id,
        communityId: ctx.community.id,
        recipientId: targetUser.id,
        metadata: { via: "admin_add", role: input.role },
      });

      return { success: true };
    }),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(invites): addMemberByEmail for existing accounts with a role"
```

---

## Task 5: `createRoleInvite` procedure (email-bound, single-use)

**Files:**
- Modify: `src/server/api/routers/communities.ts` (add after `addMemberByEmail`, before the final `});`)

- [ ] **Step 1: Add the procedure**

```ts
  /** Generate an email-bound, single-use link that grants a role */
  createRoleInvite: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        email: z.string().email(),
        role: z.enum(["admin", "moderator", "member"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole || !canManageRole(ctx.communityRole, input.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const [invite] = await ctx.db
        .insert(communityInvites)
        .values({
          communityId: ctx.community.id,
          code,
          createdBy: ctx.session.user.id,
          role: input.role,
          targetEmail: input.email.trim().toLowerCase(),
          maxUses: 1,
        })
        .returning();

      await logActivity(ctx.db, {
        actorId: ctx.session.user.id,
        actorType: "member",
        action: "community.invite_created",
        targetType: "community",
        targetId: ctx.community.id,
        metadata: { role: input.role, bound: true },
      });

      return invite!;
    }),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(invites): createRoleInvite email-bound single-use role link"
```

---

## Task 6: The 404 fix — `/invite/[token]` route + `/join` redirect + middleware

**Files:**
- Create: `src/app/[locale]/invite/[token]/page.tsx`
- Replace: `src/app/[locale]/join/[code]/page.tsx`
- Modify: `src/middleware.ts:7`

- [ ] **Step 1: Create the invite acceptance page**

```tsx
// src/app/[locale]/invite/[token]/page.tsx
"use client";

import { use, useEffect, useRef } from "react";
import { api } from "@/trpc/react";
import { useRouter } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";

export default function RedeemInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const hasFired = useRef(false);

  const mutation = api.communities.redeemInvite.useMutation({
    onSuccess: (data) => {
      router.replace(`/communities/${data.communitySlug}`);
    },
  });

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    mutation.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (mutation.error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive text-lg font-medium">
            {mutation.error.message}
          </p>
          <button
            onClick={() => router.replace("/communities")}
            className="text-muted-foreground mt-4 underline"
          >
            Browse communities
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
```

- [ ] **Step 2: Replace the old `/join/[code]` page with a redirect alias**

Overwrite `src/app/[locale]/join/[code]/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";

export default async function JoinByInviteRedirect({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/invite/${code}`);
}
```

- [ ] **Step 3: Protect `/invite` in middleware**

In `src/middleware.ts`, change line 7:

```ts
const protectedPaths = ["/dashboard", "/join", "/invite"];
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification (the 404 fix)**

Run the dev server (`npm run dev`), sign in, then:
- Generate an invite link from a community's Settings → Invites, copy it (form `…/invite/<code>`), open it in the browser.
- Expected: spinner, then redirect to `/communities/<slug>` as a member — **no 404**.
- Open an old-style `…/join/<code>` URL.
- Expected: it redirects to `/invite/<code>` and joins.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/invite/[token]/page.tsx" "src/app/[locale]/join/[code]/page.tsx" src/middleware.ts
git commit -m "fix(invites): add /invite/[token] route, redirect /join, fixes 404"
```

---

## Task 7: "Add member" UI in members settings

**Files:**
- Modify: `src/components/communities/settings/members-settings.tsx`

> Context: the component already has `slug`, `myRole`, `availableRoles()`, the `api`/`utils`, `toast`, and `Select`/`Input`/`Button`/`Label` imports patterns. Confirm `Input` and `Label` are imported; if not, add them.

- [ ] **Step 1: Ensure `Input` and `Label` are imported**

Near the top of `members-settings.tsx`, add (if missing):

```ts
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Copy } from "lucide-react";
```

- [ ] **Step 2: Add local state and mutations**

Inside the component body, after the existing `unbanMutation` declaration, add:

```ts
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "moderator" | "member">(
    "member",
  );
  const [roleLinkCode, setRoleLinkCode] = useState<string | null>(null);

  const addMemberMutation = api.communities.addMemberByEmail.useMutation({
    onSuccess: () => {
      toast.success(t("memberAdded"));
      setAddEmail("");
      setRoleLinkCode(null);
      void utils.communities.getMembers.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const roleInviteMutation = api.communities.createRoleInvite.useMutation({
    onSuccess: (data) => {
      setRoleLinkCode(data.code);
    },
    onError: (e) => toast.error(e.message),
  });

  const canAddMembers = myRole === "owner" || myRole === "admin";
```

- [ ] **Step 3: Render the "Add member" form**

Inside the returned JSX, immediately after the opening header `<div>` block (before `<Tabs defaultValue="active">`), add:

```tsx
      {canAddMembers && (
        <div className="space-y-3 rounded-lg border p-4">
          <Label>{t("addMemberTitle")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder={t("emailPlaceholder")}
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="flex-1"
            />
            <Select
              value={addRole}
              onValueChange={(r) =>
                setAddRole(r as "admin" | "moderator" | "member")
              }
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles().map((r) => (
                  <SelectItem key={r} value={r}>
                    {tRoles(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!addEmail || addMemberMutation.isPending}
              onClick={() =>
                addMemberMutation.mutate({ slug, email: addEmail, role: addRole })
              }
            >
              {t("addButton")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!addEmail || roleInviteMutation.isPending}
              onClick={() =>
                roleInviteMutation.mutate({ slug, email: addEmail, role: addRole })
              }
            >
              {t("generateLink")}
            </Button>
          </div>
          {roleLinkCode && (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2">
              <Input
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${roleLinkCode}`}
                className="flex-1 text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}/invite/${roleLinkCode}`,
                  );
                  toast.success(t("linkCopied"));
                }}
              >
                <Copy className="mr-1.5 size-3.5" />
                {t("copyLink")}
              </Button>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/communities/settings/members-settings.tsx`
Expected: PASS (translation-key warnings are fine until Task 9 lands the keys).

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/settings/members-settings.tsx
git commit -m "feat(invites): add-member-by-email + role-link UI in members settings"
```

---

## Task 8: Slug general link + badges in invites settings

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/settings/invites/page.tsx`
- Modify: `src/components/communities/settings/invites-settings.tsx`

- [ ] **Step 1: Pass `joinPolicy` from the page wrapper**

Replace `src/app/[locale]/communities/[slug]/settings/invites/page.tsx` with:

```tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { InvitesSettings } from "@/components/communities/settings/invites-settings";

export default function InvitesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: community, isLoading } = api.communities.getBySlug.useQuery({
    slug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!community) return null;

  return <InvitesSettings slug={slug} joinPolicy={community.joinPolicy} />;
}
```

- [ ] **Step 2: Accept the prop and render the slug general link**

In `src/components/communities/settings/invites-settings.tsx`, update the props interface and signature:

```ts
interface InvitesSettingsProps {
  slug: string;
  joinPolicy: "open" | "invite_only" | "approval_required";
}

export function InvitesSettings({ slug, joinPolicy }: InvitesSettingsProps) {
```

Then, inside the returned JSX, immediately after the header `<div className="flex items-center justify-between">…</div>` block, add the general-link section:

```tsx
      {joinPolicy !== "invite_only" && (
        <div className="space-y-2 rounded-lg border p-4">
          <Label>{t("generalLink")}</Label>
          <p className="text-muted-foreground text-xs">
            {t("generalLinkDescription")}
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${slug}`}
              className="flex-1 text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/invite/${slug}`,
                );
                toast.success(t("linkCopied"));
              }}
            >
              <Copy className="mr-1.5 size-3.5" />
              {t("copyLink")}
            </Button>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Show role / email-bound badges on each invite row**

In the invite list `.map((invite) => …)`, inside the `<div className="flex items-center gap-2">` that holds the `<code>` and `expired` span, add after the `expired` span:

```tsx
                    {invite.role && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                        {invite.role}
                      </span>
                    )}
                    {invite.targetEmail && (
                      <span className="text-muted-foreground text-xs">
                        → {invite.targetEmail}
                      </span>
                    )}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/communities/settings/invites-settings.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/settings/invites/page.tsx" src/components/communities/settings/invites-settings.tsx
git commit -m "feat(invites): slug general join link + role/email badges"
```

---

## Task 9: Translations

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add keys to `messages/en.json`**

Under `communities.settings.members`, add:

```json
"addMemberTitle": "Add a member",
"emailPlaceholder": "member@example.com",
"addButton": "Add",
"generateLink": "Generate invite link",
"memberAdded": "Member added",
"linkCopied": "Link copied",
"copyLink": "Copy"
```

Under `communities.settings.invites`, add:

```json
"generalLink": "General join link",
"generalLinkDescription": "Anyone with this link can join. Approval-required communities still review each request."
```

- [ ] **Step 2: Add the same keys to `messages/nl.json`** (Dutch)

Under `communities.settings.members`:

```json
"addMemberTitle": "Lid toevoegen",
"emailPlaceholder": "lid@voorbeeld.nl",
"addButton": "Toevoegen",
"generateLink": "Uitnodigingslink genereren",
"memberAdded": "Lid toegevoegd",
"linkCopied": "Link gekopieerd",
"copyLink": "Kopiëren"
```

Under `communities.settings.invites`:

```json
"generalLink": "Algemene deelnamelink",
"generalLinkDescription": "Iedereen met deze link kan lid worden. Communities met goedkeuring beoordelen elk verzoek nog steeds."
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "require('./messages/en.json'); require('./messages/nl.json'); console.log('ok')"`
Expected: prints `ok` (no JSON syntax error).

- [ ] **Step 4: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(invites): translation keys for add-member and general link"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, including `invite-policy.test.ts` and the existing `role-utils.test.ts`.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint the touched files**

Run: `npx eslint src/server/api/routers/communities.ts src/server/communities/invite-policy.ts src/components/communities/settings/members-settings.tsx src/components/communities/settings/invites-settings.tsx`
Expected: PASS.

- [ ] **Step 4: Manual end-to-end check** (dev server, signed in as a community owner/admin)

1. **Add by email (existing user):** Settings → Members → "Add a member", enter the email of another AIT account, pick `Moderator`, click **Add**. Expected: toast "Member added"; they appear in Active with the Moderator badge.
2. **Add by email (no account):** enter a random email, click **Add**. Expected: error toast "No AIT account with that email…".
3. **Role link:** enter an email, pick `Moderator`, click **Generate invite link**; copy it. In a second session signed in as *that* email, open the link. Expected: joins as Moderator. Open the same link again or as a different email. Expected: refused (max uses / wrong email).
4. **Slug link:** for an `open` community, open `…/invite/<slug>` while signed in as a non-member. Expected: joins as member. For an `invite_only` community, open `…/invite/<slug>`. Expected: "invite-only" error.
5. **404 regression:** open `…/invite/<code>` and `…/join/<code>`. Expected: both work, no 404.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(invites): verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (404 fix) → Task 6. Part 2 (slug join link + unified resolver) → Tasks 2, 3, 8. Part 3 (add by email, existing-only) → Task 4, 7. Part 4 (email-bound role link) → Tasks 5, 7. Part 5 (schema) → Task 1. Authorization via `canManageRole` → Tasks 4, 5. All covered.
- **Out of scope (per spec):** emailing non-users, a dedicated pending-role tab, an admin toggle to disable the slug link.
- **Type consistency:** `redeemInvite` returns `{ communitySlug, status }`; the page reads `data.communitySlug`. `slugJoinStatus` / `roleFromInvite` / `canRedeemInvite` signatures match between `invite-policy.ts`, its test, and `communities.ts`. New columns `role`/`targetEmail` are referenced consistently in schema, procedures, and the invites UI (`invite.role`, `invite.targetEmail`).
- **Assumption to verify during execution:** `ctx.session.user.email` is available on the better-auth session (used in `redeemInvite`). If the session type omits `email`, fetch the user row by `ctx.session.user.id` and read `email` from there.
