# Member Profiles & Gamification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add member profiles with a public directory, gamification (XP + badges), and a leaderboard to the AIT Community platform.

**Architecture:** Member data lives in Drizzle (like event registrations). A `membersRouter` in tRPC handles all profile/gamification CRUD. Avatars are computed (GitHub OAuth → Gravatar → initials). XP and badges are awarded server-side via helper functions called from tRPC mutations.

**Tech Stack:** Next.js 15, tRPC 11, Drizzle ORM, Neon Postgres, Better Auth, next-intl, shadcn/ui, Tailwind CSS

---

## Task 1: Add memberProfiles and memberBadges tables to Drizzle schema

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Add the memberProfiles table**

Append after the `eventRegistrationRelations` block (after line 173):

```typescript
// Member profiles (1:1 with user)
export const memberProfiles = pgTable(
  "member_profile",
  (d) => ({
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .references(() => user.id),
    displayName: d.varchar({ length: 255 }).notNull(),
    bio: d.text(),
    skills: d
      .json()
      .$type<string[]>()
      .default([])
      .notNull(),
    company: d.varchar({ length: 255 }),
    linkedinUrl: d.varchar({ length: 255 }),
    githubUrl: d.varchar({ length: 255 }),
    websiteUrl: d.varchar({ length: 255 }),
    isPublic: d.boolean().default(true).notNull(),
    xp: d.integer().default(0).notNull(),
    level: d.integer().default(1).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("member_profile_xp_idx").on(t.xp),
  ],
);

export const memberProfileRelations = relations(memberProfiles, ({ one }) => ({
  user: one(user, {
    fields: [memberProfiles.userId],
    references: [user.id],
  }),
}));

// Member badges (join table)
export const memberBadges = pgTable(
  "member_badge",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id),
    badgeSlug: d.varchar({ length: 100 }).notNull(),
    earnedAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
  (t) => [
    index("member_badge_user_idx").on(t.userId),
    index("member_badge_slug_idx").on(t.badgeSlug),
  ],
);

export const memberBadgeRelations = relations(memberBadges, ({ one }) => ({
  user: one(user, {
    fields: [memberBadges.userId],
    references: [user.id],
  }),
}));
```

**Step 2: Push schema to Neon**

Run: `pnpm drizzle-kit push`
Expected: Tables `member_profile` and `member_badge` created successfully.

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat: add memberProfiles and memberBadges tables to Drizzle schema"
```

---

## Task 2: Create gamification helpers (badge definitions, XP, badge award logic)

**Files:**
- Create: `src/lib/gamification.ts`

**Step 1: Create the gamification module**

```typescript
import { eq, sql, and } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type * as schema from "@/server/db/schema";
import { memberProfiles, memberBadges, eventRegistrations, user } from "@/server/db/schema";

// --- Badge Definitions ---

export interface BadgeDefinition {
  slug: string;
  name: string;
  description: string;
}

export const BADGES: Record<string, BadgeDefinition> = {
  profile_complete: {
    slug: "profile_complete",
    name: "Profile Complete",
    description: "Filled out all profile fields",
  },
  first_event: {
    slug: "first_event",
    name: "First Event",
    description: "Attended your first event",
  },
  regular: {
    slug: "regular",
    name: "Regular",
    description: "Attended 3 events",
  },
  veteran: {
    slug: "veteran",
    name: "Veteran",
    description: "Attended 10 events",
  },
  early_adopter: {
    slug: "early_adopter",
    name: "Early Adopter",
    description: "Among the first 100 members",
  },
  speaker: {
    slug: "speaker",
    name: "Speaker",
    description: "Listed as a speaker at an event",
  },
};

// --- XP Amounts ---

export const XP_AMOUNTS = {
  PROFILE_COMPLETE: 50,
  REGISTER_EVENT: 25,
  ATTEND_EVENT: 100,
  FIRST_EVENT_BONUS: 50,
} as const;

// --- Leveling ---

export function calculateLevel(xp: number): number {
  return Math.floor(xp / 200) + 1;
}

export function xpForNextLevel(currentXp: number): { current: number; needed: number } {
  const level = calculateLevel(currentXp);
  const levelStart = (level - 1) * 200;
  return {
    current: currentXp - levelStart,
    needed: 200,
  };
}

// --- DB Helpers ---

type DB = NeonHttpDatabase<typeof schema>;

/**
 * Award XP to a user and recalculate their level.
 * No-op if the user has no profile yet.
 */
export async function awardXp(db: DB, userId: string, amount: number) {
  await db
    .update(memberProfiles)
    .set({
      xp: sql`${memberProfiles.xp} + ${amount}`,
      level: sql`floor((${memberProfiles.xp} + ${amount}) / 200) + 1`,
    })
    .where(eq(memberProfiles.userId, userId));
}

/**
 * Award a badge if not already earned. Returns true if newly awarded.
 */
export async function awardBadge(
  db: DB,
  userId: string,
  badgeSlug: string,
): Promise<boolean> {
  // Check if already earned
  const [existing] = await db
    .select()
    .from(memberBadges)
    .where(
      and(
        eq(memberBadges.userId, userId),
        eq(memberBadges.badgeSlug, badgeSlug),
      ),
    )
    .limit(1);

  if (existing) return false;

  await db.insert(memberBadges).values({ userId, badgeSlug });
  return true;
}

/**
 * Check and award attendance-based badges based on current count.
 */
export async function checkAttendanceBadges(db: DB, userId: string) {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, userId),
        eq(eventRegistrations.status, "attended"),
      ),
    );

  const attended = countResult?.count ?? 0;

  if (attended >= 1) {
    const isFirst = await awardBadge(db, userId, "first_event");
    if (isFirst) {
      await awardXp(db, userId, XP_AMOUNTS.FIRST_EVENT_BONUS);
    }
  }
  if (attended >= 3) await awardBadge(db, userId, "regular");
  if (attended >= 10) await awardBadge(db, userId, "veteran");
}

/**
 * Check if user qualifies for the early_adopter badge.
 */
export async function checkEarlyAdopterBadge(db: DB, userId: string) {
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(memberProfiles);

  const totalProfiles = countResult?.count ?? 0;
  if (totalProfiles <= 100) {
    await awardBadge(db, userId, "early_adopter");
  }
}

/**
 * Check if profile is complete (all key fields filled).
 */
export function isProfileComplete(profile: {
  displayName: string;
  bio: string | null;
  skills: string[];
  company: string | null;
}): boolean {
  return (
    profile.displayName.length > 0 &&
    !!profile.bio &&
    profile.bio.length > 0 &&
    profile.skills.length > 0 &&
    !!profile.company &&
    profile.company.length > 0
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/lib/gamification.ts
git commit -m "feat: add gamification helpers (XP, badges, leveling)"
```

---

## Task 3: Create avatar utility

**Files:**
- Create: `src/lib/avatar.ts`

**Step 1: Create the avatar helper**

```typescript
import { createHash } from "crypto";

/**
 * Get avatar URL for a user. Priority:
 * 1. GitHub OAuth image (user.image)
 * 2. Gravatar via email hash
 * 3. null (render initials in component)
 */
export function getAvatarUrl(
  email: string,
  image?: string | null,
  size = 80,
): string | null {
  if (image) return image;

  if (email) {
    const hash = createHash("md5")
      .update(email.trim().toLowerCase())
      .digest("hex");
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
  }

  return null;
}

/**
 * Get initials from a display name for fallback avatar.
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
```

**Step 2: Commit**

```bash
git add src/lib/avatar.ts
git commit -m "feat: add avatar utility (Gravatar + initials fallback)"
```

---

## Task 4: Create members tRPC router

**Files:**
- Create: `src/server/api/routers/members.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create the members router**

```typescript
import { z } from "zod";
import { eq, sql, and, or, ilike } from "drizzle-orm";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "@/server/api/trpc";
import { memberProfiles, memberBadges, user, eventRegistrations } from "@/server/db/schema";
import {
  awardXp,
  awardBadge,
  checkEarlyAdopterBadge,
  isProfileComplete,
  XP_AMOUNTS,
  BADGES,
} from "@/lib/gamification";

const upsertProfileInput = z.object({
  displayName: z.string().min(1).max(255),
  bio: z.string().max(2000).nullable(),
  skills: z.array(z.string().max(50)).max(20),
  company: z.string().max(255).nullable(),
  linkedinUrl: z.string().url().max(255).nullable().or(z.literal("")),
  githubUrl: z.string().url().max(255).nullable().or(z.literal("")),
  websiteUrl: z.string().url().max(255).nullable().or(z.literal("")),
  isPublic: z.boolean(),
});

export const membersRouter = createTRPCRouter({
  /** Get the current user's own profile + badges. */
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [profile] = await ctx.db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, userId))
      .limit(1);

    const badges = await ctx.db
      .select()
      .from(memberBadges)
      .where(eq(memberBadges.userId, userId));

    return {
      profile: profile ?? null,
      badges: badges.map((b) => ({
        ...BADGES[b.badgeSlug],
        earnedAt: b.earnedAt,
      })),
    };
  }),

  /** Create or update the current user's profile. */
  upsertProfile: protectedProcedure
    .input(upsertProfileInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Normalize empty strings to null for URL fields
      const linkedinUrl = input.linkedinUrl || null;
      const githubUrl = input.githubUrl || null;
      const websiteUrl = input.websiteUrl || null;

      // Check if profile exists
      const [existing] = await ctx.db
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);

      const isNew = !existing;

      if (isNew) {
        await ctx.db.insert(memberProfiles).values({
          userId,
          displayName: input.displayName,
          bio: input.bio,
          skills: input.skills,
          company: input.company,
          linkedinUrl,
          githubUrl,
          websiteUrl,
          isPublic: input.isPublic,
        });
      } else {
        await ctx.db
          .update(memberProfiles)
          .set({
            displayName: input.displayName,
            bio: input.bio,
            skills: input.skills,
            company: input.company,
            linkedinUrl,
            githubUrl,
            websiteUrl,
            isPublic: input.isPublic,
          })
          .where(eq(memberProfiles.userId, userId));
      }

      // Check profile completion for XP and badge
      if (
        isProfileComplete({
          displayName: input.displayName,
          bio: input.bio,
          skills: input.skills,
          company: input.company,
        })
      ) {
        const awarded = await awardBadge(ctx.db, userId, "profile_complete");
        if (awarded) {
          await awardXp(ctx.db, userId, XP_AMOUNTS.PROFILE_COMPLETE);
        }
      }

      // Check early adopter on first profile creation
      if (isNew) {
        await checkEarlyAdopterBadge(ctx.db, userId);
      }

      return { success: true, isNew };
    }),

  /** Get a public member profile by userId. */
  getPublicProfile: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [profile] = await ctx.db
        .select()
        .from(memberProfiles)
        .where(
          and(
            eq(memberProfiles.userId, input.userId),
            eq(memberProfiles.isPublic, true),
          ),
        )
        .limit(1);

      if (!profile) return null;

      const [memberUser] = await ctx.db
        .select({ email: user.email, image: user.image })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      const badges = await ctx.db
        .select()
        .from(memberBadges)
        .where(eq(memberBadges.userId, input.userId));

      const [attendedCount] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(
          and(
            eq(eventRegistrations.userId, input.userId),
            eq(eventRegistrations.status, "attended"),
          ),
        );

      return {
        profile,
        user: memberUser ?? null,
        badges: badges.map((b) => ({
          ...BADGES[b.badgeSlug],
          earnedAt: b.earnedAt,
        })),
        eventsAttended: attendedCount?.count ?? 0,
      };
    }),

  /** List public members, paginated, with search and skill filter. Sorted by XP. */
  listMembers: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        skill: z.string().optional(),
        cursor: z.number().default(0),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(memberProfiles.isPublic, true)];

      if (input.search) {
        conditions.push(
          or(
            ilike(memberProfiles.displayName, `%${input.search}%`),
            ilike(memberProfiles.company, `%${input.search}%`),
          )!,
        );
      }

      const profiles = await ctx.db
        .select({
          profile: memberProfiles,
          email: user.email,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(memberProfiles.userId, user.id))
        .where(and(...conditions))
        .orderBy(sql`${memberProfiles.xp} DESC`)
        .offset(input.cursor)
        .limit(input.limit + 1); // +1 to check if there are more

      const hasMore = profiles.length > input.limit;
      const items = hasMore ? profiles.slice(0, input.limit) : profiles;

      // Filter by skill in application layer (JSON column)
      const filtered = input.skill
        ? items.filter((item) =>
            (item.profile.skills as string[]).some(
              (s) => s.toLowerCase() === input.skill!.toLowerCase(),
            ),
          )
        : items;

      // Get badge counts for each member
      const memberIds = filtered.map((m) => m.profile.userId);
      const badgeCounts =
        memberIds.length > 0
          ? await ctx.db
              .select({
                userId: memberBadges.userId,
                count: sql<number>`count(*)`,
              })
              .from(memberBadges)
              .where(
                sql`${memberBadges.userId} IN ${memberIds}`,
              )
              .groupBy(memberBadges.userId)
          : [];

      const badgeCountMap = new Map(
        badgeCounts.map((bc) => [bc.userId, bc.count]),
      );

      return {
        items: filtered.map((m) => ({
          ...m,
          badgeCount: badgeCountMap.get(m.profile.userId) ?? 0,
        })),
        nextCursor: hasMore ? input.cursor + input.limit : null,
      };
    }),

  /** Top 5 members by XP for leaderboard. */
  getLeaderboard: publicProcedure.query(async ({ ctx }) => {
    const top = await ctx.db
      .select({
        profile: memberProfiles,
        email: user.email,
        image: user.image,
      })
      .from(memberProfiles)
      .innerJoin(user, eq(memberProfiles.userId, user.id))
      .where(eq(memberProfiles.isPublic, true))
      .orderBy(sql`${memberProfiles.xp} DESC`)
      .limit(5);

    // Get badge counts
    const userIds = top.map((t) => t.profile.userId);
    const badgeCounts =
      userIds.length > 0
        ? await ctx.db
            .select({
              userId: memberBadges.userId,
              count: sql<number>`count(*)`,
            })
            .from(memberBadges)
            .where(sql`${memberBadges.userId} IN ${userIds}`)
            .groupBy(memberBadges.userId)
        : [];

    const badgeCountMap = new Map(
      badgeCounts.map((bc) => [bc.userId, bc.count]),
    );

    return top.map((t) => ({
      ...t,
      badgeCount: badgeCountMap.get(t.profile.userId) ?? 0,
    }));
  }),
});
```

**Step 2: Register in root router**

In `src/server/api/root.ts`, add the import and register the router:

Add import at the top:
```typescript
import { membersRouter } from "@/server/api/routers/members";
```

Add to appRouter:
```typescript
export const appRouter = createTRPCRouter({
  post: postRouter,
  events: eventsRouter,
  members: membersRouter,
});
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/server/api/routers/members.ts src/server/api/root.ts
git commit -m "feat: add members tRPC router with profile CRUD and gamification"
```

---

## Task 5: Wire XP and badges into existing events router

**Files:**
- Modify: `src/server/api/routers/events.ts`

**Step 1: Add XP award to the `register` mutation**

Add import at top of `src/server/api/routers/events.ts`:

```typescript
import { awardXp, XP_AMOUNTS, memberProfiles } from "@/lib/gamification";
```

Wait — we need the db schema import too. Update the imports:

```typescript
import { memberProfiles } from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
```

After the `return { registration: registration!, alreadyRegistered: false };` line (line 65), add XP award before the return. Replace the end of the register mutation (from the insert to the return) with:

```typescript
      const [registration] = await ctx.db
        .insert(eventRegistrations)
        .values({
          eventId: input.eventId,
          userId,
          status,
        })
        .returning();

      // Award XP for registration (only if user has a profile)
      const [profile] = await ctx.db
        .select()
        .from(memberProfiles)
        .where(eq(memberProfiles.userId, userId))
        .limit(1);

      if (profile) {
        await awardXp(ctx.db, userId, XP_AMOUNTS.REGISTER_EVENT);
      }

      return { registration: registration!, alreadyRegistered: false };
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/server/api/routers/events.ts`
Expected: Clean.

**Step 3: Commit**

```bash
git add src/server/api/routers/events.ts
git commit -m "feat: award XP on event registration"
```

---

## Task 6: Add i18n translations for members namespace

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add `members` and `dashboard` keys to `messages/en.json`**

Add after the `"language"` block:

```json
  "members": {
    "title": "Members",
    "search": "Search members...",
    "filterBySkill": "Filter by skill",
    "allSkills": "All skills",
    "noMembers": "No members found.",
    "leaderboard": "Leaderboard",
    "level": "LVL",
    "xp": "XP",
    "badges": "Badges",
    "eventsAttended": "Events Attended",
    "skills": "Skills",
    "bio": "Bio",
    "socialLinks": "Links",
    "memberSince": "Member since",
    "profilePrivate": "This profile is private."
  },
  "dashboard": {
    "myProfile": "MY PROFILE",
    "completeProfile": "Complete your profile to earn 50 XP!",
    "completeProfileCta": "Set up profile",
    "editProfile": "EDIT",
    "displayName": "Display Name",
    "bio": "Bio",
    "skills": "Skills (comma-separated)",
    "company": "Company",
    "linkedinUrl": "LinkedIn URL",
    "githubUrl": "GitHub URL",
    "websiteUrl": "Website URL",
    "publicProfile": "Public profile",
    "saveProfile": "Save",
    "saving": "Saving...",
    "profileSaved": "Profile saved!",
    "profileError": "Failed to save profile."
  },
  "badges": {
    "profile_complete": "Profile Complete",
    "first_event": "First Event",
    "regular": "Regular",
    "veteran": "Veteran",
    "early_adopter": "Early Adopter",
    "speaker": "Speaker"
  }
```

**Step 2: Add the same keys to `messages/nl.json`**

```json
  "members": {
    "title": "Leden",
    "search": "Zoek leden...",
    "filterBySkill": "Filter op vaardigheid",
    "allSkills": "Alle vaardigheden",
    "noMembers": "Geen leden gevonden.",
    "leaderboard": "Ranglijst",
    "level": "LVL",
    "xp": "XP",
    "badges": "Badges",
    "eventsAttended": "Bijgewoonde evenementen",
    "skills": "Vaardigheden",
    "bio": "Bio",
    "socialLinks": "Links",
    "memberSince": "Lid sinds",
    "profilePrivate": "Dit profiel is privé."
  },
  "dashboard": {
    "myProfile": "MIJN PROFIEL",
    "completeProfile": "Vul je profiel in en verdien 50 XP!",
    "completeProfileCta": "Profiel instellen",
    "editProfile": "BEWERKEN",
    "displayName": "Weergavenaam",
    "bio": "Bio",
    "skills": "Vaardigheden (kommagescheiden)",
    "company": "Bedrijf",
    "linkedinUrl": "LinkedIn URL",
    "githubUrl": "GitHub URL",
    "websiteUrl": "Website URL",
    "publicProfile": "Openbaar profiel",
    "saveProfile": "Opslaan",
    "saving": "Opslaan...",
    "profileSaved": "Profiel opgeslagen!",
    "profileError": "Profiel opslaan mislukt."
  },
  "badges": {
    "profile_complete": "Profiel Compleet",
    "first_event": "Eerste Evenement",
    "regular": "Vaste Bezoeker",
    "veteran": "Veteraan",
    "early_adopter": "Vroege Gebruiker",
    "speaker": "Spreker"
  }
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat: add i18n translations for members, dashboard profile, and badges"
```

---

## Task 7: Add [M] MEMBERS link to navbar

**Files:**
- Modify: `src/components/navbar.tsx`

**Step 1: Add members to navLinks**

In `src/components/navbar.tsx`, change the `navLinks` array (line 17-21):

```typescript
const navLinks = [
  { href: "/events", key: "events", shortcut: "E" },
  { href: "/members", key: "members", shortcut: "M" },
  { href: "/blog", key: "blog", shortcut: "B" },
  { href: "/community", key: "community", shortcut: "C" },
] as const;
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/navbar.tsx`
Expected: Clean. The `nav.members` i18n key already exists in `messages/en.json` (line 7).

**Step 3: Commit**

```bash
git add src/components/navbar.tsx
git commit -m "feat: add [M] MEMBERS link to navbar"
```

---

## Task 8: Create profile edit form component (client)

**Files:**
- Create: `src/components/profile-edit-form.tsx`

**Step 1: Create the form component**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ProfileEditFormProps {
  initialData?: {
    displayName: string;
    bio: string | null;
    skills: string[];
    company: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    websiteUrl: string | null;
    isPublic: boolean;
  } | null;
}

export function ProfileEditForm({ initialData }: ProfileEditFormProps) {
  const t = useTranslations("dashboard");
  const utils = api.useUtils();

  const [displayName, setDisplayName] = useState(initialData?.displayName ?? "");
  const [bio, setBio] = useState(initialData?.bio ?? "");
  const [skillsText, setSkillsText] = useState(
    (initialData?.skills ?? []).join(", "),
  );
  const [company, setCompany] = useState(initialData?.company ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initialData?.linkedinUrl ?? "");
  const [githubUrl, setGithubUrl] = useState(initialData?.githubUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl ?? "");
  const [isPublic, setIsPublic] = useState(initialData?.isPublic ?? true);

  const upsertMutation = api.members.upsertProfile.useMutation({
    onSuccess: () => {
      toast.success(t("profileSaved"));
      void utils.members.getMyProfile.invalidate();
    },
    onError: () => {
      toast.error(t("profileError"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const skills = skillsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    upsertMutation.mutate({
      displayName,
      bio: bio || null,
      skills,
      company: company || null,
      linkedinUrl: linkedinUrl || null,
      githubUrl: githubUrl || null,
      websiteUrl: websiteUrl || null,
      isPublic,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3">
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("displayName")}
        </label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("bio")}
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="border-border bg-background mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("skills")}
        </label>
        <Input
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
          placeholder="AI, Python, LLMs"
          className="mt-1"
        />
      </div>
      <div>
        <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
          {t("company")}
        </label>
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("linkedinUrl")}
          </label>
          <Input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            type="url"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("githubUrl")}
          </label>
          <Input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            type="url"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-muted-foreground font-mono text-[11px] tracking-wider">
            {t("websiteUrl")}
          </label>
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            type="url"
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          id="isPublic"
          className="rounded"
        />
        <label
          htmlFor="isPublic"
          className="text-muted-foreground font-mono text-[11px] tracking-wider"
        >
          {t("publicProfile")}
        </label>
      </div>
      <Button
        type="submit"
        className="w-full font-mono text-xs tracking-wider"
        disabled={upsertMutation.isPending}
      >
        {upsertMutation.isPending ? t("saving") : t("saveProfile")}
      </Button>
    </form>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/profile-edit-form.tsx
git commit -m "feat: add profile edit form component"
```

---

## Task 9: Create dashboard profile section component (client)

**Files:**
- Create: `src/components/dashboard-profile.tsx`

**Step 1: Create the dashboard profile section**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { ProfileEditForm } from "./profile-edit-form";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { xpForNextLevel } from "@/lib/gamification";

interface DashboardProfileProps {
  userEmail: string;
  userImage?: string | null;
  userName?: string | null;
}

export function DashboardProfile({
  userEmail,
  userImage,
  userName,
}: DashboardProfileProps) {
  const t = useTranslations("dashboard");
  const tBadges = useTranslations("badges");
  const tMembers = useTranslations("members");
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = api.members.getMyProfile.useQuery();

  if (isLoading) {
    return (
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("myProfile")}
        </span>
        <p className="text-muted-foreground mt-4 text-sm">Loading...</p>
      </div>
    );
  }

  const profile = data?.profile;
  const badges = data?.badges ?? [];

  // No profile yet — show prompt
  if (!profile) {
    return (
      <div>
        <div className="border-border border-b pb-4">
          <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / {t("myProfile")}
          </span>
        </div>
        {!editing ? (
          <div className="mt-4 rounded border border-dashed border-primary/30 px-4 py-6 text-center">
            <p className="text-muted-foreground text-sm">
              {t("completeProfile")}
            </p>
            <button
              onClick={() => setEditing(true)}
              className="text-primary hover:text-primary/80 mt-2 font-mono text-xs tracking-wider underline underline-offset-4"
            >
              {t("completeProfileCta")}
            </button>
          </div>
        ) : (
          <ProfileEditForm initialData={null} />
        )}
      </div>
    );
  }

  // Has profile
  const avatarUrl = getAvatarUrl(userEmail, userImage);
  const initials = getInitials(profile.displayName || userName || "?");
  const xpProgress = xpForNextLevel(profile.xp);

  return (
    <div>
      <div className="border-border flex items-center justify-between border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("myProfile")}
        </span>
        <button
          onClick={() => setEditing(!editing)}
          className="text-muted-foreground hover:text-foreground font-mono text-[11px] tracking-wider transition-colors"
        >
          [{editing ? "CLOSE" : t("editProfile")}]
        </button>
      </div>

      {editing ? (
        <ProfileEditForm initialData={profile} />
      ) : (
        <div className="mt-4 flex items-start gap-4">
          {/* Avatar */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={profile.displayName}
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="bg-secondary text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full font-mono text-sm font-medium">
              {initials}
            </div>
          )}

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{profile.displayName}</span>
              <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider">
                {tMembers("level")} {profile.level}
              </span>
            </div>
            {profile.company && (
              <span className="text-muted-foreground font-mono text-xs">
                @ {profile.company}
              </span>
            )}
            {/* XP progress bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="bg-secondary h-1.5 flex-1 rounded-full">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{
                    width: `${(xpProgress.current / xpProgress.needed) * 100}%`,
                  }}
                />
              </div>
              <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
                {profile.xp} {tMembers("xp")}
              </span>
            </div>
            {/* Badges row */}
            {badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {badges.map((badge) => (
                  <span
                    key={badge.slug}
                    className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
                    title={badge.description}
                  >
                    {tBadges(badge.slug)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 3: Commit**

```bash
git add src/components/dashboard-profile.tsx
git commit -m "feat: add dashboard profile section with XP bar and badges"
```

---

## Task 10: Extend dashboard page with profile section

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx`

**Step 1: Add the DashboardProfile component**

Add import near the top of the file:

```typescript
import { DashboardProfile } from "@/components/dashboard-profile";
```

Then insert the profile section in the JSX, right after the `<p>` welcome message (after line 84) and before the My Events section (before the `{/* My Events section */}` comment):

```tsx
      {/* My Profile section */}
      <div className="mt-12">
        <DashboardProfile
          userEmail={session.user.email}
          userImage={session.user.image}
          userName={session.user.name}
        />
      </div>
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/\\[locale\\]/dashboard/page.tsx`
Expected: Clean.

**Step 3: Commit**

```bash
git add src/app/\\[locale\\]/dashboard/page.tsx
git commit -m "feat: add profile section to dashboard page"
```

---

## Task 11: Create member directory page

**Files:**
- Create: `src/app/[locale]/members/page.tsx`

**Step 1: Create the members listing page**

```tsx
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { Link } from "@/i18n/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { MemberSearch } from "@/components/member-search";

export default async function MembersPage() {
  const t = await getTranslations("members");

  const [leaderboard, members] = await Promise.all([
    api.members.getLeaderboard(),
    api.members.listMembers({ limit: 20 }),
  ]);

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </span>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="mt-6">
          <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
            / {t("leaderboard").toUpperCase()}
          </span>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {leaderboard.map((member, i) => {
              const avatarUrl = getAvatarUrl(member.email, member.image);
              const initials = getInitials(member.profile.displayName);
              return (
                <Link
                  key={member.profile.userId}
                  href={`/members/${member.profile.userId}`}
                  className="border-border hover:bg-secondary/50 flex min-w-[140px] items-center gap-3 rounded border px-3 py-2.5 transition-colors"
                >
                  <span className="text-muted-foreground font-mono text-[11px] font-medium">
                    #{i + 1}
                  </span>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={member.profile.displayName}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="bg-secondary text-muted-foreground flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.profile.displayName}
                    </p>
                    <p className="text-muted-foreground font-mono text-[10px] tracking-wider">
                      {t("level")} {member.profile.level} · {member.badgeCount}{" "}
                      {t("badges").toLowerCase()}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <MemberSearch />

      {/* Member Grid (server-rendered initial load) */}
      {members.items.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {t("noMembers")}
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.items.map((member) => {
            const avatarUrl = getAvatarUrl(member.email, member.image);
            const initials = getInitials(member.profile.displayName);
            const skills = (member.profile.skills as string[]).slice(0, 3);
            return (
              <Link
                key={member.profile.userId}
                href={`/members/${member.profile.userId}`}
                className="border-border hover:bg-secondary/50 rounded border px-4 py-4 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={member.profile.displayName}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="bg-secondary text-muted-foreground flex h-10 w-10 items-center justify-center rounded-full font-mono text-xs">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {member.profile.displayName}
                      </span>
                      <span className="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wider">
                        {t("level")} {member.profile.level}
                      </span>
                    </div>
                    {member.profile.company && (
                      <p className="text-muted-foreground truncate font-mono text-xs">
                        @ {member.profile.company}
                      </p>
                    )}
                  </div>
                </div>
                {skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\\[locale\\]/members/page.tsx
git commit -m "feat: add member directory page with leaderboard and grid"
```

---

## Task 12: Create member search component (client)

**Files:**
- Create: `src/components/member-search.tsx`

**Step 1: Create the search/filter component**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";

export function MemberSearch() {
  const t = useTranslations("members");
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // For MVP, we'll use URL search params and server-side revalidation
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    router.push(`/members${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <form onSubmit={handleSearch} className="mt-6">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("search")}
        className="max-w-sm font-mono text-xs"
      />
    </form>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/member-search.tsx
git commit -m "feat: add member search component"
```

---

## Task 13: Create public member profile page

**Files:**
- Create: `src/app/[locale]/members/[id]/page.tsx`

**Step 1: Create the profile page**

```tsx
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
import { notFound } from "next/navigation";
import { getAvatarUrl, getInitials } from "@/lib/avatar";
import { xpForNextLevel } from "@/lib/gamification";
import { Linkedin, Github, Globe } from "lucide-react";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("members");
  const tBadges = await getTranslations("badges");

  const data = await api.members.getPublicProfile({ userId: id });
  if (!data) notFound();

  const { profile, user: memberUser, badges, eventsAttended } = data;
  const avatarUrl = getAvatarUrl(
    memberUser?.email ?? "",
    memberUser?.image,
    120,
  );
  const initials = getInitials(profile.displayName);
  const xpProgress = xpForNextLevel(profile.xp);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-12">
      {/* Header */}
      <div className="flex items-start gap-5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={profile.displayName}
            className="h-20 w-20 rounded-full"
          />
        ) : (
          <div className="bg-secondary text-muted-foreground flex h-20 w-20 items-center justify-center rounded-full font-mono text-xl font-medium">
            {initials}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {profile.displayName}
            </h1>
            <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider">
              {t("level")} {profile.level}
            </span>
          </div>
          {profile.company && (
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              @ {profile.company}
            </p>
          )}
          {/* XP progress */}
          <div className="mt-3 flex items-center gap-2">
            <div className="bg-secondary h-1.5 w-32 rounded-full">
              <div
                className="bg-primary h-1.5 rounded-full"
                style={{
                  width: `${(xpProgress.current / xpProgress.needed) * 100}%`,
                }}
              />
            </div>
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {profile.xp} {t("xp")}
            </span>
          </div>
        </div>
      </div>

      {/* Social Links */}
      {(profile.linkedinUrl ?? profile.githubUrl ?? profile.websiteUrl) && (
        <div className="mt-6 flex gap-3">
          {profile.linkedinUrl && (
            <a
              href={profile.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          {profile.githubUrl && (
            <a
              href={profile.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-4 w-4" />
            </a>
          )}
          {profile.websiteUrl && (
            <a
              href={profile.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Globe className="h-4 w-4" />
            </a>
          )}
        </div>
      )}

      {/* Bio */}
      {profile.bio && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("bio").toUpperCase()}
            </span>
          </div>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Skills */}
      {(profile.skills as string[]).length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("skills").toUpperCase()}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(profile.skills as string[]).map((skill) => (
              <span
                key={skill}
                className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] tracking-wider"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / {t("badges").toUpperCase()}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((badge) => (
              <div
                key={badge.slug}
                className="border-border rounded border border-dashed px-3 py-2.5"
              >
                <p className="font-mono text-xs font-medium">
                  {tBadges(badge.slug)}
                </p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wider">
                  {badge.earnedAt
                    ? new Date(badge.earnedAt).toLocaleDateString()
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="border-border mt-8 border-t pt-8">
        <div className="flex gap-8">
          <div>
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {t("eventsAttended").toUpperCase()}
            </span>
            <p className="mt-1 text-2xl font-extrabold">{eventsAttended}</p>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-[10px] tracking-wider">
              {t("badges").toUpperCase()}
            </span>
            <p className="mt-1 text-2xl font-extrabold">{badges.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: Clean.

**Step 3: Commit**

```bash
git add src/app/\\[locale\\]/members/\\[id\\]/page.tsx
git commit -m "feat: add public member profile page with XP, badges, and stats"
```

---

## Task 14: Final verification

**Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 2: Run full ESLint check**

Run: `npx eslint src/`
Expected: No errors.

**Step 3: Run production build**

Run: `pnpm build`
Expected: Build succeeds with `/[locale]/members` and `/[locale]/members/[id]` routes listed.

**Step 4: Push schema**

Run: `pnpm drizzle-kit push`
Expected: Tables created/updated.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete member profiles with gamification (Phase 3)"
```
