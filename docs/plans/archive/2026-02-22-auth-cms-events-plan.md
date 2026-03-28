# Auth, CMS & Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete auth, migrate to Neon Postgres, integrate Payload CMS, and build the Events system (Phase 2).

**Architecture:** Two-system split — Payload CMS for admin content management (events, articles, speakers, pages, media) and existing Better Auth + tRPC + Drizzle stack for member-facing features (auth, registration, forum). Both share one Neon Postgres database.

**Tech Stack:** Next.js 15, Payload CMS 3.x, Neon Postgres, Drizzle ORM, Better Auth, tRPC 11, next-intl

---

## Part 1: Database Migration (SQLite → Neon Postgres)

### Task 1: Install Neon dependencies and remove SQLite

**Files:**
- Modify: `package.json`

**Step 1: Install Neon packages**

Run:
```bash
pnpm add @neondatabase/serverless drizzle-orm@latest
pnpm add -D drizzle-kit@latest
```

**Step 2: Remove SQLite packages**

Run:
```bash
pnpm remove @libsql/client @auth/drizzle-adapter
```

**Step 3: Verify installation**

Run: `pnpm ls @neondatabase/serverless`
Expected: Package listed with version

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: swap SQLite deps for Neon Postgres"
```

---

### Task 2: Rewrite Drizzle schema for PostgreSQL

**Files:**
- Modify: `src/server/db/schema.ts`

**Step 1: Replace the entire schema**

Replace all `sqliteTable` with `pgTable`, `integer` timestamps with `timestamp`, `text` IDs remain text. Remove the `posts` example table.

```typescript
import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, boolean, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";

// Better Auth core tables
export const user = pgTable("user", {
  id: text("id").notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export const userRelations = relations(user, ({ many }) => ({
  account: many(account),
  session: many(session),
}));

export const account = pgTable("account", {
  id: text("id").notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
}, (t) => [index("account_user_id_idx").on(t.userId)]);

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const session = pgTable("session", {
  id: text("id").notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => user.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
}, (t) => [index("session_user_id_idx").on(t.userId)]);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const verification = pgTable("verification", {
  id: text("id").notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

// Event registrations (member-facing, managed by Drizzle)
export const registrationStatusEnum = pgEnum("registration_status", [
  "registered", "waitlisted", "cancelled", "attended"
]);

export const eventRegistrations = pgTable("event_registration", {
  id: text("id").notNull().primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: integer("event_id").notNull(), // References Payload events table
  userId: text("user_id").notNull().references(() => user.id),
  status: registrationStatusEnum("status").notNull().default("registered"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (t) => [
  index("registration_event_idx").on(t.eventId),
  index("registration_user_idx").on(t.userId),
]);

export const eventRegistrationRelations = relations(eventRegistrations, ({ one }) => ({
  user: one(user, { fields: [eventRegistrations.userId], references: [user.id] }),
}));
```

**Step 2: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat: rewrite Drizzle schema for PostgreSQL with event_registrations"
```

---

### Task 3: Update DB client for Neon

**Files:**
- Modify: `src/server/db/index.ts`

**Step 1: Rewrite the DB client**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/env";
import * as schema from "./schema";

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

**Step 2: Commit**

```bash
git add src/server/db/index.ts
git commit -m "feat: switch DB client to Neon serverless"
```

---

### Task 4: Update Drizzle config and env

**Files:**
- Modify: `drizzle.config.ts`
- Modify: `src/env.js`
- Modify: `.env.example`

**Step 1: Update drizzle.config.ts**

```typescript
import { type Config } from "drizzle-kit";

import { env } from "@/env";

export default {
  schema: "./src/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
} satisfies Config;
```

Remove `tablesFilter` — Payload manages its own tables, Drizzle manages yours.

**Step 2: Update env.js**

Change `DATABASE_URL` validation from `z.string().url()` to `z.string()` (Neon connection strings may not pass strict URL validation depending on Zod version):

In `src/env.js`, change the `DATABASE_URL` line in the server schema to:
```javascript
DATABASE_URL: z.string(),
```

**Step 3: Update .env.example**

```
DATABASE_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"
```

**Step 4: Update actual .env**

Set `DATABASE_URL` to your Neon connection string (the user must create a Neon project first).

**Step 5: Commit**

```bash
git add drizzle.config.ts src/env.js .env.example
git commit -m "feat: update Drizzle config and env for Neon Postgres"
```

---

### Task 5: Update Better Auth config for Postgres

**Files:**
- Modify: `src/server/better-auth/config.ts`

**Step 1: Change provider to "pg"**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "@/env";
import { db } from "@/server/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
```

Note: removed hardcoded `redirectURI` — Better Auth will auto-detect it.

**Step 2: Commit**

```bash
git add src/server/better-auth/config.ts
git commit -m "feat: switch Better Auth to Postgres provider"
```

---

### Task 6: Push schema and verify

**Step 1: Push Drizzle schema to Neon**

Run:
```bash
pnpm drizzle-kit push
```

Expected: Tables created successfully (user, account, session, verification, event_registration)

**Step 2: Verify the app starts**

Run:
```bash
pnpm dev
```

Expected: App starts without errors at localhost:3000

**Step 3: Commit any generated files**

```bash
git add -A
git commit -m "chore: push schema to Neon Postgres, verify migration"
```

---

## Part 2: Auth Completion

### Task 7: Wire signup form to Better Auth

**Files:**
- Modify: `src/app/[locale]/auth/signup/page.tsx`

**Step 1: Implement the form submission**

Replace the entire file. Key changes:
- Import `authClient` from `@/server/better-auth/client`
- Import `useRouter` from `@/i18n/navigation`
- Import `toast` from `sonner`
- Add state for `email`, `password`, `name`
- Wire `handleSubmit` to `authClient.signUp.email()`
- Wire GitHub button to `authClient.signIn.social({ provider: "github" })`
- Add error handling with Sonner toasts
- Redirect to `/` on success

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github } from "lucide-react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";

export default function SignUpPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Sign up failed");
      return;
    }
    toast.success("Account created!");
    router.push("/");
  }

  async function handleGitHub() {
    await authClient.signIn.social({ provider: "github" });
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("signUp")}
          </h1>
          <p className="text-sm text-muted-foreground">
            Join AIT<span className="text-primary">.</span> Community
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-mono text-xs tracking-wider">
              {t("name").toUpperCase()}
            </Label>
            <Input id="name" type="text" placeholder="Jane Doe" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs tracking-wider">
              {t("email").toUpperCase()}
            </Label>
            <Input id="email" type="email" placeholder="engineer@company.nl" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="font-mono text-xs tracking-wider">
              {t("password").toUpperCase()}
            </Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingUp") : t("signUp")}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 font-mono text-muted-foreground">
              {t("orContinueWith").toUpperCase()}
            </span>
          </div>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={handleGitHub}>
          <Github className="h-4 w-4" />
          {t("github")}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link href="/auth/signin" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/auth/signup/page.tsx
git commit -m "feat: wire signup form to Better Auth"
```

---

### Task 8: Wire signin form to Better Auth

**Files:**
- Modify: `src/app/[locale]/auth/signin/page.tsx`

**Step 1: Implement the form submission**

Same pattern as signup. Key difference: use `authClient.signIn.email()`.

```typescript
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github } from "lucide-react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";

export default function SignInPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    router.push("/");
  }

  async function handleGitHub() {
    await authClient.signIn.social({ provider: "github" });
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("signIn")}
          </h1>
          <p className="text-sm text-muted-foreground">
            AIT<span className="text-primary">.</span> Community
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs tracking-wider">
              {t("email").toUpperCase()}
            </Label>
            <Input id="email" type="email" placeholder="engineer@company.nl" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="font-mono text-xs tracking-wider">
                {t("password").toUpperCase()}
              </Label>
            </div>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 font-mono text-muted-foreground">
              {t("orContinueWith").toUpperCase()}
            </span>
          </div>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={handleGitHub}>
          <Github className="h-4 w-4" />
          {t("github")}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/auth/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/auth/signin/page.tsx
git commit -m "feat: wire signin form to Better Auth"
```

---

### Task 9: Add Sonner toast provider to layout

**Files:**
- Modify: `src/app/[locale]/layout.tsx`

**Step 1: Add Toaster component**

Add `import { Toaster } from "sonner"` and place `<Toaster />` inside the body, after `<Footer />`:

```tsx
<Footer />
<Toaster position="bottom-right" />
```

**Step 2: Commit**

```bash
git add src/app/[locale]/layout.tsx
git commit -m "feat: add Sonner toast provider to layout"
```

---

### Task 10: Make navbar session-aware

**Files:**
- Modify: `src/components/navbar.tsx`

**Step 1: Add auth state to navbar**

Key changes:
- Import `authClient` from `@/server/better-auth/client`
- Call `authClient.useSession()` to get current session
- When logged in: show user initials/avatar + `[D] DASHBOARD` link + sign out button
- When logged out: show `[J] JOIN` (existing behavior)

Add after the existing imports:
```typescript
import { authClient } from "@/server/better-auth/client";
import { LogOut } from "lucide-react";
```

Inside the `Navbar` component, add:
```typescript
const { data: session } = authClient.useSession();
```

Replace the `{/* Right: Language + Join */}` desktop section with:
```tsx
<div className="hidden items-center gap-2 md:flex">
  <LanguageSwitcher />
  {session?.user ? (
    <>
      <Link
        href="/dashboard"
        className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        [D] DASHBOARD
      </Link>
      <button
        onClick={() => authClient.signOut().then(() => window.location.reload())}
        className="rounded p-1.5 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </>
  ) : (
    <Link
      href="/auth/signup"
      className="rounded bg-foreground px-3.5 py-1.5 font-mono text-xs font-semibold text-background transition-opacity hover:opacity-80"
    >
      [J] JOIN
    </Link>
  )}
</div>
```

Apply the same pattern to the mobile Sheet menu.

**Step 2: Commit**

```bash
git add src/components/navbar.tsx
git commit -m "feat: make navbar session-aware with auth state"
```

---

### Task 11: Add auth route protection to middleware

**Files:**
- Modify: `src/middleware.ts`

**Step 1: Extend middleware with auth check**

```typescript
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const protectedPaths = ["/dashboard"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip locale prefix to check path
  const pathWithoutLocale = pathname.replace(/^\/(en|nl)/, "") || "/";

  // Check if this is a protected route
  const isProtected = protectedPaths.some((p) => pathWithoutLocale.startsWith(p));

  if (isProtected) {
    // Better Auth stores session in cookie named "better-auth.session_token"
    const sessionToken = request.cookies.get("better-auth.session_token");
    if (!sessionToken) {
      const locale = pathname.startsWith("/nl") ? "nl" : "en";
      const signInUrl = new URL(`/${locale}/auth/signin`, request.url);
      signInUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next|.*\\..*).*)",
  ],
};
```

**Step 2: Create a minimal dashboard page**

Create `src/app/[locale]/dashboard/page.tsx`:

```tsx
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">
        Dashboard
      </h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session.user.name ?? session.user.email}
      </p>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/middleware.ts src/app/[locale]/dashboard/page.tsx
git commit -m "feat: add auth route protection and dashboard page"
```

---

### Task 12: Manual verification of auth flow

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Test signup**

1. Navigate to `/en/auth/signup`
2. Fill in name, email, password (min 8 chars)
3. Submit → should show success toast and redirect to `/`
4. Navbar should now show `[D] DASHBOARD` and logout icon

**Step 3: Test sign-out**

1. Click logout icon → should reload and show `[J] JOIN` again

**Step 4: Test signin**

1. Navigate to `/en/auth/signin`
2. Enter the email/password from signup
3. Submit → should redirect to `/`

**Step 5: Test route protection**

1. Sign out
2. Navigate to `/en/dashboard` → should redirect to `/en/auth/signin?redirect=/en/dashboard`

**Step 6: Test GitHub OAuth**

1. Click GitHub button on signin page → should redirect to GitHub OAuth flow
2. After authorizing → should redirect back and be signed in

---

## Part 3: Payload CMS Integration

### Task 13: Install Payload CMS dependencies

**Step 1: Install Payload packages**

Run:
```bash
pnpm add payload @payloadcms/next @payloadcms/db-postgres @payloadcms/richtext-lexical @payloadcms/storage-uploadthing sharp graphql
```

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install Payload CMS dependencies"
```

---

### Task 14: Create Payload config

**Files:**
- Create: `src/payload.config.ts`
- Create: `src/payload-types.ts` (auto-generated later)

**Step 1: Create payload config**

```typescript
import path from "path";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

import { Events } from "./collections/Events";
import { Speakers } from "./collections/Speakers";
import { Articles } from "./collections/Articles";
import { Pages } from "./collections/Pages";
import { Media } from "./collections/Media";

export default buildConfig({
  admin: {
    user: "users",
    meta: {
      titleSuffix: " — AIT Admin",
    },
  },
  collections: [Events, Speakers, Articles, Pages, Media, {
    slug: "users",
    auth: true,
    admin: { useAsTitle: "email" },
    fields: [
      { name: "name", type: "text" },
      { name: "role", type: "select", options: ["admin", "editor"], defaultValue: "editor" },
    ],
  }],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL! },
  }),
  localization: {
    locales: [
      { label: "English", code: "en" },
      { label: "Nederlands", code: "nl" },
    ],
    defaultLocale: "en",
    fallback: true,
  },
  typescript: {
    outputFile: path.resolve(__dirname, "payload-types.ts"),
  },
  secret: process.env.PAYLOAD_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
});
```

**Step 2: Commit**

```bash
git add src/payload.config.ts
git commit -m "feat: add Payload CMS config with localization"
```

---

### Task 15: Create Payload collections

**Files:**
- Create: `src/collections/Events.ts`
- Create: `src/collections/Speakers.ts`
- Create: `src/collections/Articles.ts`
- Create: `src/collections/Pages.ts`
- Create: `src/collections/Media.ts`

**Step 1: Events collection**

```typescript
import type { CollectionConfig } from "payload";

export const Events: CollectionConfig = {
  slug: "events",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "date", "status"],
  },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    { name: "slug", type: "text", required: true, unique: true, admin: { position: "sidebar" } },
    { name: "description", type: "richText", required: true, localized: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Workshop", value: "workshop" },
        { label: "Hackathon", value: "hackathon" },
        { label: "Deep Dive", value: "deep_dive" },
        { label: "Meetup", value: "meetup" },
      ],
    },
    { name: "date", type: "date", required: true, admin: { position: "sidebar" } },
    { name: "startTime", type: "text" },
    { name: "endTime", type: "text" },
    { name: "location", type: "text", required: true },
    { name: "maxAttendees", type: "number" },
    { name: "image", type: "upload", relationTo: "media" },
    {
      name: "speakers",
      type: "relationship",
      relationTo: "speakers",
      hasMany: true,
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Completed", value: "completed" },
      ],
      admin: { position: "sidebar" },
    },
  ],
};
```

**Step 2: Speakers collection**

```typescript
import type { CollectionConfig } from "payload";

export const Speakers: CollectionConfig = {
  slug: "speakers",
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "bio", type: "textarea", localized: true },
    { name: "company", type: "text" },
    { name: "photo", type: "upload", relationTo: "media" },
    { name: "linkedinUrl", type: "text" },
    { name: "githubUrl", type: "text" },
  ],
};
```

**Step 3: Articles collection**

```typescript
import type { CollectionConfig } from "payload";

export const Articles: CollectionConfig = {
  slug: "articles",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "publishedAt"],
  },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    { name: "slug", type: "text", required: true, unique: true },
    { name: "content", type: "richText", required: true, localized: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Article", value: "article" },
        { label: "Tutorial", value: "tutorial" },
        { label: "Talk Recording", value: "talk_recording" },
      ],
    },
    { name: "tags", type: "json" },
    { name: "mediaUrl", type: "text" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
  ],
};
```

**Step 4: Pages collection**

```typescript
import type { CollectionConfig } from "payload";

export const Pages: CollectionConfig = {
  slug: "pages",
  admin: { useAsTitle: "title" },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    { name: "slug", type: "text", required: true, unique: true },
    { name: "content", type: "richText", required: true, localized: true },
  ],
};
```

**Step 5: Media collection**

```typescript
import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  admin: { useAsTitle: "alt" },
  upload: {
    mimeTypes: ["image/*"],
    imageSizes: [
      { name: "thumbnail", width: 300, height: 300, position: "centre" },
      { name: "card", width: 768, height: 432, position: "centre" },
      { name: "hero", width: 1440, height: 600, position: "centre" },
    ],
  },
  fields: [
    { name: "alt", type: "text", required: true },
  ],
};
```

**Step 6: Commit**

```bash
git add src/collections/
git commit -m "feat: add Payload collections (Events, Speakers, Articles, Pages, Media)"
```

---

### Task 16: Wire Payload into Next.js

**Files:**
- Create: `src/app/(payload)/admin/[[...segments]]/page.tsx`
- Create: `src/app/(payload)/admin/[[...segments]]/not-found.tsx`
- Create: `src/app/(payload)/layout.tsx`
- Create: `src/app/(payload)/api/[...slug]/route.ts`
- Modify: `next.config.js`

**Step 1: Create Payload admin route files**

`src/app/(payload)/admin/[[...segments]]/page.tsx`:
```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import type { Metadata } from "next";
import config from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import { importMap } from "../importMap";

type Args = { params: Promise<{ segments: string[] }>; searchParams: Promise<Record<string, string | string[]>> };

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams, importMap });

export default Page;
```

`src/app/(payload)/admin/[[...segments]]/not-found.tsx`:
```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import type { Metadata } from "next";
import config from "@payload-config";
import { RootNotFound, generatePageMetadata } from "@payloadcms/next/views";
import { importMap } from "../importMap";

type Args = { params: Promise<{ segments: string[] }>; searchParams: Promise<Record<string, string | string[]>> };

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

const NotFound = ({ params, searchParams }: Args) =>
  RootNotFound({ config, params, searchParams, importMap });

export default NotFound;
```

`src/app/(payload)/layout.tsx`:
```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import type { ServerFunctionClient } from "payload";
import config from "@payload-config";
import { RootLayout } from "@payloadcms/next/layouts";
import React from "react";
import { importMap } from "./admin/importMap";
import "@payloadcms/next/css";

type Args = { children: React.ReactNode };

const Layout = ({ children }: Args) =>
  RootLayout({ children, config, importMap });

export default Layout;
```

`src/app/(payload)/api/[...slug]/route.ts`:
```tsx
/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
import config from "@payload-config";
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from "@payloadcms/next/routes";

export const GET = REST_GET(config);
export const POST = REST_POST(config);
export const DELETE = REST_DELETE(config);
export const PATCH = REST_PATCH(config);
export const PUT = REST_PUT(config);
export const OPTIONS = REST_OPTIONS(config);
```

**Step 2: Add import map placeholder**

Create `src/app/(payload)/admin/importMap.ts`:
```typescript
// This file will be auto-generated by Payload
export const importMap = {};
```

**Step 3: Update next.config.js**

```javascript
import "./src/env.js";
import createNextIntlPlugin from "next-intl/plugin";
import { withPayload } from "@payloadcms/next/withPayload";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import("next").NextConfig} */
const config = {
  images: {
    domains: ["localhost"],
  },
};

export default withPayload(withNextIntl(config));
```

**Step 4: Add `@payload-config` path alias to tsconfig.json**

Add to `compilerOptions.paths`:
```json
"@payload-config": ["./src/payload.config.ts"]
```

**Step 5: Update middleware to exclude Payload admin routes**

In `src/middleware.ts`, update the matcher to also exclude `(payload)` and `admin`:
```typescript
export const config = {
  matcher: [
    "/((?!api|admin|_next|.*\\..*).*)",
  ],
};
```

**Step 6: Add `PAYLOAD_SECRET` to env**

In `.env`, add:
```
PAYLOAD_SECRET="your-payload-secret-min-32-chars-long"
```

Update `src/env.js` server schema:
```javascript
PAYLOAD_SECRET: z.string().optional(),
```

And runtimeEnv:
```javascript
PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
```

**Step 7: Start dev and verify admin panel**

Run: `pnpm dev`
Navigate to: `http://localhost:3000/admin`
Expected: Payload admin login screen. Create first admin user.

**Step 8: Commit**

```bash
git add src/app/\(payload\)/ src/payload.config.ts next.config.js tsconfig.json src/middleware.ts src/env.js .env.example
git commit -m "feat: integrate Payload CMS admin panel into Next.js"
```

---

## Part 4: Events System (Phase 2)

### Task 17: Create events tRPC router

**Files:**
- Create: `src/server/api/routers/events.ts`
- Modify: `src/server/api/root.ts`

**Step 1: Create events router**

```typescript
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc";
import { eventRegistrations } from "@/server/db/schema";

export const eventsRouter = createTRPCRouter({
  register: protectedProcedure
    .input(z.object({
      eventId: z.number(),
      maxAttendees: z.number().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check if already registered
      const existing = await ctx.db.query.eventRegistrations.findFirst({
        where: and(
          eq(eventRegistrations.eventId, input.eventId),
          eq(eventRegistrations.userId, ctx.session.user.id),
          eq(eventRegistrations.status, "registered"),
        ),
      });
      if (existing) throw new Error("Already registered");

      // Count current registrations
      const [count] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.eventId, input.eventId),
          eq(eventRegistrations.status, "registered"),
        ));

      const status = input.maxAttendees && (count?.count ?? 0) >= input.maxAttendees
        ? "waitlisted" as const
        : "registered" as const;

      const [registration] = await ctx.db
        .insert(eventRegistrations)
        .values({
          eventId: input.eventId,
          userId: ctx.session.user.id,
          status,
        })
        .returning();

      return registration;
    }),

  cancelRegistration: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(eventRegistrations)
        .set({ status: "cancelled" })
        .where(and(
          eq(eventRegistrations.eventId, input.eventId),
          eq(eventRegistrations.userId, ctx.session.user.id),
        ));
    }),

  myRegistrations: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.eventRegistrations.findMany({
      where: and(
        eq(eventRegistrations.userId, ctx.session.user.id),
        eq(eventRegistrations.status, "registered"),
      ),
    });
  }),

  registrationStatus: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.eventRegistrations.findFirst({
        where: and(
          eq(eventRegistrations.eventId, input.eventId),
          eq(eventRegistrations.userId, ctx.session.user.id),
        ),
      });
    }),
});
```

**Step 2: Add to root router**

In `src/server/api/root.ts`:
```typescript
import { postRouter } from "@/server/api/routers/post";
import { eventsRouter } from "@/server/api/routers/events";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  post: postRouter,
  events: eventsRouter,
});
```

**Step 3: Commit**

```bash
git add src/server/api/routers/events.ts src/server/api/root.ts
git commit -m "feat: add events tRPC router with registration logic"
```

---

### Task 18: Create events listing page

**Files:**
- Create: `src/app/[locale]/events/page.tsx`

**Step 1: Create listing page that reads from Payload**

```tsx
import { getPayload } from "payload";
import config from "@payload-config";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function EventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("events");
  const payload = await getPayload({ config });

  const { docs: events } = await payload.find({
    collection: "events",
    where: { status: { equals: "published" } },
    sort: "date",
    locale: locale as "en" | "nl",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">
          {t("title")}
        </h1>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground">{t("noEvents")}</p>
      ) : (
        <div className="divide-y divide-border">
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="flex items-center gap-4 py-4 transition-colors hover:bg-muted/50"
            >
              <div className="h-2 w-2 rounded-sm bg-foreground" />
              <span className="font-mono text-sm text-muted-foreground">
                {new Date(event.date).toLocaleDateString()}
              </span>
              <span className="font-medium">{event.title}</span>
              <span className="rounded border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {event.type}
              </span>
              <span className="ml-auto font-mono text-lg text-muted-foreground">+</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/events/page.tsx
git commit -m "feat: add events listing page reading from Payload CMS"
```

---

### Task 19: Create event detail page with registration

**Files:**
- Create: `src/app/[locale]/events/[slug]/page.tsx`
- Create: `src/components/event-register-button.tsx`

**Step 1: Create event detail page**

```tsx
import { getPayload } from "payload";
import config from "@payload-config";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EventRegisterButton } from "@/components/event-register-button";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const payload = await getPayload({ config });

  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: slug } },
    locale: locale as "en" | "nl",
    depth: 2,
  });

  const event = docs[0];
  if (!event) notFound();

  const speakers = Array.isArray(event.speakers)
    ? event.speakers.filter((s): s is { id: number; name: string; bio?: string; company?: string } => typeof s === "object")
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
      <div className="mb-2 font-mono text-sm text-muted-foreground">
        {new Date(event.date).toLocaleDateString()} · {event.startTime}–{event.endTime} · {event.location}
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight">{event.title}</h1>

      <div className="mt-2 flex gap-2">
        <span className="rounded border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {event.type}
        </span>
        {event.maxAttendees && (
          <span className="font-mono text-xs text-muted-foreground">
            Max {event.maxAttendees} attendees
          </span>
        )}
      </div>

      <div className="mt-8 prose prose-neutral max-w-none">
        {/* Payload rich text rendered here — use @payloadcms/richtext-lexical/react for production */}
        <p className="text-muted-foreground">Event description content renders here.</p>
      </div>

      {speakers.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-mono text-xs tracking-wider text-muted-foreground">SPEAKERS</h2>
          <div className="space-y-3">
            {speakers.map((speaker) => (
              <div key={speaker.id} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted" />
                <div>
                  <div className="font-medium">{speaker.name}</div>
                  {speaker.company && (
                    <div className="text-sm text-muted-foreground">{speaker.company}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12">
        <EventRegisterButton eventId={event.id} maxAttendees={event.maxAttendees ?? null} />
      </div>
    </div>
  );
}
```

**Step 2: Create registration button component**

```tsx
"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { authClient } from "@/server/better-auth/client";
import { useRouter } from "@/i18n/navigation";

export function EventRegisterButton({
  eventId,
  maxAttendees,
}: {
  eventId: number;
  maxAttendees: number | null;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const { data: registration, isLoading: statusLoading } = api.events.registrationStatus.useQuery(
    { eventId },
    { enabled: !!session?.user },
  );

  const utils = api.useUtils();

  const register = api.events.register.useMutation({
    onSuccess: (data) => {
      toast.success(data?.status === "waitlisted" ? "Added to waitlist" : "Registered!");
      void utils.events.registrationStatus.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });

  const cancel = api.events.cancelRegistration.useMutation({
    onSuccess: () => {
      toast.success("Registration cancelled");
      void utils.events.registrationStatus.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!session?.user) {
    return (
      <Button onClick={() => router.push("/auth/signin")} className="w-full sm:w-auto">
        Sign in to register
      </Button>
    );
  }

  if (statusLoading) return null;

  if (registration && registration.status !== "cancelled") {
    return (
      <div className="flex items-center gap-4">
        <span className="font-mono text-sm text-muted-foreground">
          Status: {registration.status}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => cancel.mutate({ eventId })}
          disabled={cancel.isPending}
        >
          Cancel registration
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => register.mutate({ eventId, maxAttendees })}
      disabled={register.isPending}
      className="w-full sm:w-auto"
    >
      {register.isPending ? "Registering..." : "Register"}
    </Button>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/[locale]/events/[slug]/page.tsx src/components/event-register-button.tsx
git commit -m "feat: add event detail page with registration button"
```

---

### Task 20: Add "My Events" to dashboard

**Files:**
- Modify: `src/app/[locale]/dashboard/page.tsx`

**Step 1: Extend dashboard with registered events**

```tsx
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getPayload } from "payload";
import config from "@payload-config";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const locale = await getLocale();
  const payload = await getPayload({ config });

  // Get user's registrations
  const registrations = await db.query.eventRegistrations.findMany({
    where: and(
      eq(eventRegistrations.userId, session.user.id),
      eq(eventRegistrations.status, "registered"),
    ),
  });

  // Fetch event details from Payload for each registration
  const eventIds = registrations.map((r) => r.eventId);
  const events = eventIds.length > 0
    ? (await payload.find({
        collection: "events",
        where: { id: { in: eventIds } },
        locale: locale as "en" | "nl",
      })).docs
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session.user.name ?? session.user.email}
      </p>

      <div className="mt-12">
        <h2 className="mb-4 font-mono text-xs tracking-wider text-muted-foreground">
          / MY EVENTS
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming events.{" "}
            <Link href="/events" className="underline">Browse events</Link>
          </p>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="flex items-center gap-4 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="h-2 w-2 rounded-sm bg-foreground" />
                <span className="font-mono text-sm text-muted-foreground">
                  {new Date(event.date).toLocaleDateString()}
                </span>
                <span className="font-medium">{event.title}</span>
                <span className="rounded border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {event.type}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/[locale]/dashboard/page.tsx
git commit -m "feat: add My Events section to dashboard"
```

---

### Task 21: Final integration verification

**Step 1: Start dev server**

Run: `pnpm dev`

**Step 2: Verify Payload admin**

1. Go to `http://localhost:3000/admin`
2. Log in (or create first admin user)
3. Create a test event with title, slug, date, type, status=published
4. Create a test speaker and link to event

**Step 3: Verify public events page**

1. Go to `http://localhost:3000/en/events`
2. Should see the published event in the list
3. Click event → detail page with speaker info

**Step 4: Verify registration flow**

1. Sign up as a member via `/en/auth/signup`
2. Navigate to the test event
3. Click "Register" → should show success toast
4. Go to `/en/dashboard` → event should appear under "My Events"
5. Go back to event → should show "Cancel registration" option

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete auth, CMS integration, and events system (Phase 2)"
```
