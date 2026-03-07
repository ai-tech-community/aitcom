# UI/UX Functional Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the functional and information-architecture issues found in the March 7, 2026 review so the app works correctly in local development and the main public/member journeys feel logically organized.

**Architecture:** Address the work in dependency order: restore local auth first, then fix broken actions, then clean up dashboard navigation semantics, then correct misleading impact visualizations, and finally improve section discoverability on the public/community surfaces. Keep each change small, testable, and isolated so regressions are easy to spot.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-intl, Better Auth, tRPC, Payload CMS, Tailwind CSS.

---

### Task 1: Add Minimal Regression Test Coverage For This Fix Batch

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/impact-display.test.ts`
- Create: `src/components/agent-suggestions.test.tsx`
- Create: `src/components/dashboard-tabs.test.tsx`

**Step 1: Add a focused test runner**

Add dev dependencies and scripts for Vitest + Testing Library:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Add the smallest viable config:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

**Step 2: Run test command to verify it fails before implementation**

Run: `pnpm test`

Expected: fail because the new test files/helpers do not exist yet.

**Step 3: Add setup file**

Create:

```ts
import "@testing-library/jest-dom/vitest";
```

**Step 4: Add failing tests for the known issues**

Create tests that assert:

```ts
// src/lib/impact-display.test.ts
import { describe, expect, it } from "vitest";
import { formatDurationMinutes, getContributionMixWidths } from "./impact-display";

describe("formatDurationMinutes", () => {
  it("formats long durations into days and hours", () => {
    expect(formatDurationMinutes(3231)).toBe("2d 5h");
  });
});

describe("getContributionMixWidths", () => {
  it("uses row totals, not global totals", () => {
    expect(getContributionMixWidths({ aiOnly: 2, humanOnly: 1, collaborative: 1 })).toEqual({
      aiOnly: 50,
      humanOnly: 25,
      collaborative: 25,
    });
  });
});
```

```tsx
// src/components/agent-suggestions.test.tsx
it("routes topic suggestions to /forum/new", () => {
  // render a topic suggestion row and assert the link href
});
```

```tsx
// src/components/dashboard-tabs.test.tsx
it("shows notifications in dashboard navigation", () => {
  // render tabs and assert notifications is present
});
```

**Step 5: Run tests to confirm they fail for the current code**

Run:
- `pnpm test src/lib/impact-display.test.ts`
- `pnpm test src/components/agent-suggestions.test.tsx`
- `pnpm test src/components/dashboard-tabs.test.tsx`

Expected: failures matching the review findings.

**Step 6: Commit**

```bash
git add package.json vitest.config.ts src/test/setup.ts src/lib/impact-display.test.ts src/components/agent-suggestions.test.tsx src/components/dashboard-tabs.test.tsx
git commit -m "test: add regression coverage for review fixes"
```

### Task 2: Fix Better Auth Origin Resolution For Local Review Ports

**Files:**
- Modify: `src/server/better-auth/config.ts`
- Modify: `src/env.js`
- Modify: `.env.example`
- Optionally Create: `src/server/better-auth/base-url.ts`
- Test: `src/server/better-auth/base-url.test.ts`

**Step 1: Write the failing test**

Create a small helper so the origin logic is testable:

```ts
import { describe, expect, it } from "vitest";
import { resolveBetterAuthBaseUrl } from "./base-url";

describe("resolveBetterAuthBaseUrl", () => {
  it("prefers explicit env base url when set", () => {
    expect(resolveBetterAuthBaseUrl({
      BETTER_AUTH_URL: "http://localhost:3002",
      BETTER_AUTH_BASE_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3001",
    })).toBe("http://localhost:3002");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when auth env vars are absent", () => {
    expect(resolveBetterAuthBaseUrl({
      NEXT_PUBLIC_APP_URL: "http://localhost:3002",
    })).toBe("http://localhost:3002");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/server/better-auth/base-url.test.ts`

Expected: fail because helper does not exist yet.

**Step 3: Implement minimal base-url helper**

Create:

```ts
type AuthUrlEnv = {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

export function resolveBetterAuthBaseUrl(env: AuthUrlEnv) {
  return env.BETTER_AUTH_URL
    ?? env.BETTER_AUTH_BASE_URL
    ?? env.NEXT_PUBLIC_APP_URL
    ?? "http://localhost:3000";
}
```

**Step 4: Wire helper into Better Auth config**

Update `src/server/better-auth/config.ts`:

```ts
import { resolveBetterAuthBaseUrl } from "./base-url";

baseURL: resolveBetterAuthBaseUrl({
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
  NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
}),
```

**Step 5: Make env validation explicit**

Update `src/env.js` server schema/runtime env to include:

```ts
BETTER_AUTH_URL: z.string().url().optional(),
BETTER_AUTH_BASE_URL: z.string().url().optional(),
```

and add both to `runtimeEnv`.

Update `.env.example` to document the local-dev rule:

```env
NEXT_PUBLIC_APP_URL="http://localhost:3000"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_BASE_URL="http://localhost:3000"
```

**Step 6: Run verification**

Run:
- `pnpm test src/server/better-auth/base-url.test.ts`
- `pnpm typecheck`
- `pnpm lint`

Manual check:
- start dev on `3002`
- open `/en/auth/signup`
- sign up with a throwaway address
- confirm no `Invalid origin` toast/error

**Step 7: Commit**

```bash
git add src/server/better-auth/config.ts src/server/better-auth/base-url.ts src/server/better-auth/base-url.test.ts src/env.js .env.example
git commit -m "fix(auth): support non-default local origins"
```

### Task 3: Fix Broken Agent Suggestion Actions

**Files:**
- Modify: `src/components/agent-suggestions.tsx`
- Test: `src/components/agent-suggestions.test.tsx`

**Step 1: Write the failing test**

Assert that topic suggestions navigate to the real thread composer:

```tsx
it("links topic suggestions to the forum composer", () => {
  expect(screen.getByRole("link", { name: /create thread/i })).toHaveAttribute("href", "/forum/new");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/components/agent-suggestions.test.tsx`

Expected: current code points to `/community`.

**Step 3: Implement the minimal fix**

Change:

```tsx
href="/community"
```

to:

```tsx
href="/forum/new"
```

Optionally rename the action if needed:

```tsx
Create Thread
```

should stay only if it truly opens the composer.

**Step 4: Run verification**

Run:
- `pnpm test src/components/agent-suggestions.test.tsx`
- `pnpm lint`

Manual check:
- open agent dashboard with pending suggestions
- click `Create Thread`
- confirm it lands on `/forum/new`

**Step 5: Commit**

```bash
git add src/components/agent-suggestions.tsx src/components/agent-suggestions.test.tsx
git commit -m "fix(agent): route topic suggestions to thread composer"
```

### Task 4: Reorganize Dashboard Navigation And Section Semantics

**Files:**
- Modify: `src/components/dashboard-tabs.tsx`
- Modify: `src/app/[locale]/dashboard/layout.tsx`
- Modify: `src/app/[locale]/dashboard/impact/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/nl.json`
- Test: `src/components/dashboard-tabs.test.tsx`

**Step 1: Write the failing test**

Add tests for the intended IA:

```tsx
it("includes notifications in the dashboard nav", () => {
  expect(screen.getByText(/notifications/i)).toBeInTheDocument();
});

it("does not label the QA page as generic impact", () => {
  expect(screen.getByText(/qa/i)).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test src/components/dashboard-tabs.test.tsx`

Expected: current tabs omit notifications and expose the QA page as `impact`.

**Step 3: Implement the navigation cleanup**

Recommended structure:

```ts
const tabs = [
  { path: "/dashboard", labelKey: "feed" },
  { path: "/dashboard/agent", labelKey: "agent" },
  { path: "/challenges", labelKey: "challenges" },
  { path: "/dashboard/events", labelKey: "events" },
  { path: "/dashboard/notifications", labelKey: "notifications" },
  { path: "/dashboard/settings", labelKey: "settings" },
];
```

**Step 4: Make the QA route honest**

Either:

```tsx
title: "Impact QA - AIT"
```

and change the tab label to `qa`

or:

move the QA page to `/dashboard/qa` and reserve `impact` for the public page.

Preferred fix: move the member-facing dashboard away from the misleading `impact` label.

**Step 5: Improve first-time discoverability**

In `dashboard/layout.tsx`, add a lightweight secondary link row when relevant:

```tsx
<Link href="/dashboard/onboarding">Onboarding</Link>
<Link href="/dashboard/notifications">Notifications</Link>
```

Only show onboarding when it is incomplete.

**Step 6: Run verification**

Run:
- `pnpm test src/components/dashboard-tabs.test.tsx`
- `pnpm typecheck`
- `pnpm lint`

Manual check:
- authenticated user can reach notifications from dashboard nav
- QA/admin analytics are not mislabeled as normal member impact
- onboarding remains discoverable

**Step 7: Commit**

```bash
git add src/components/dashboard-tabs.tsx src/app/[locale]/dashboard/layout.tsx src/app/[locale]/dashboard/impact/page.tsx messages/en.json messages/nl.json
git commit -m "fix(dashboard): clarify navigation and section labels"
```

### Task 5: Fix Impact Metric Formatting And Chart Semantics

**Files:**
- Create: `src/lib/impact-display.ts`
- Modify: `src/components/impact/kpi-strip.tsx`
- Modify: `src/components/impact/audience-blocks.tsx`
- Modify: `src/components/impact/trend-panels.tsx`
- Test: `src/lib/impact-display.test.ts`

**Step 1: Write the failing tests**

Expand `src/lib/impact-display.test.ts`:

```ts
it("formats 3231 minutes as 2d 5h", () => {
  expect(formatDurationMinutes(3231)).toBe("2d 5h");
});

it("formats 95 minutes as 1h 35m", () => {
  expect(formatDurationMinutes(95)).toBe("1h 35m");
});

it("returns row-relative widths for mix charts", () => {
  expect(getContributionMixWidths({ aiOnly: 3, humanOnly: 1, collaborative: 2 })).toEqual({
    aiOnly: 50,
    humanOnly: 16.666666666666664,
    collaborative: 33.33333333333333,
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/impact-display.test.ts`

Expected: helper module does not exist yet.

**Step 3: Implement reusable display helpers**

Create:

```ts
export function formatDurationMinutes(value: number | null) {
  if (value == null) return "-";
  if (value < 60) return `${value}m`;

  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  const minutes = value % 60;

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function getContributionMixWidths(input: {
  aiOnly: number;
  humanOnly: number;
  collaborative: number;
}) {
  const total = Math.max(1, input.aiOnly + input.humanOnly + input.collaborative);
  return {
    aiOnly: (input.aiOnly / total) * 100,
    humanOnly: (input.humanOnly / total) * 100,
    collaborative: (input.collaborative / total) * 100,
  };
}
```

**Step 4: Apply helpers in the UI**

Update:
- `kpi-strip.tsx` to format response time with `formatDurationMinutes`
- `audience-blocks.tsx` to format `responseHealth` similarly
- `trend-panels.tsx` to compute each stacked row from `getContributionMixWidths(entry)` instead of `maxMix`

**Step 5: Keep the weekly collaboration chart absolute if desired**

Do not change the first chart unless product wants a different story. Only fix the stacked mix chart that visually implies composition.

**Step 6: Run verification**

Run:
- `pnpm test src/lib/impact-display.test.ts`
- `pnpm typecheck`
- `pnpm lint`

Manual check on `/en/impact`:
- response times read as human time, not raw minutes
- stacked bars fill each row proportionally
- no layout regressions on mobile/desktop

**Step 7: Commit**

```bash
git add src/lib/impact-display.ts src/lib/impact-display.test.ts src/components/impact/kpi-strip.tsx src/components/impact/audience-blocks.tsx src/components/impact/trend-panels.tsx
git commit -m "fix(impact): clarify time formatting and mix chart semantics"
```

### Task 6: Make Community And Public Section Flow More Explicit

**Files:**
- Modify: `src/components/community/community-board.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Optionally Modify: `src/components/forum/forum-page.tsx`

**Step 1: Write the failing test or manual acceptance criteria**

There is no existing public-page component test harness for these server/client combinations yet, so use explicit manual acceptance criteria:

1. Community page should expose its destinations without requiring hotspot discovery.
2. Homepage should not send unauthenticated users straight into a dashboard dead end.
3. The agent/proactive story should be visible before the user hits auth walls.

**Step 2: Add explicit navigation on the community board**

Above or below the town-square image, add a visible action row:

```tsx
<Link href="/forum">Forum</Link>
<button type="button">Rules</button>
<button type="button">Ideas</button>
<button type="button">Contribute</button>
```

Keep the hotspot map, but stop relying on it as the only navigation model.

**Step 3: Improve the homepage CTA order**

In `src/app/[locale]/page.tsx`, change the CTA block so the first card points to a public explainer path before the gated dashboard path. Recommended order:

```ts
[
  { title: "...", href: "/community" },
  { title: "...", href: "/challenges" },
  { title: "...", href: "/sponsors" },
]
```

If product wants to keep `/dashboard/agent`, gate the label/copy by session state so guests understand they will sign in first.

**Step 4: Make forum posting affordance clearer for guests**

In `forum-page.tsx`, replace plain text:

```tsx
Sign in to post
```

with a real sign-in/up link or button.

**Step 5: Run verification**

Run:
- `pnpm typecheck`
- `pnpm lint`

Manual check:
- `/en/community` exposes explicit destinations
- `/en` CTA path reads logically for guests
- `/en/forum` gives guests a clickable next step

**Step 6: Commit**

```bash
git add src/components/community/community-board.tsx src/app/[locale]/page.tsx src/components/forum/forum-page.tsx
git commit -m "fix(ui): improve section discoverability and guest flow"
```

### Task 7: Remove Or Align Legacy Agent Connection Guidance

**Files:**
- Modify: `src/components/agent-connect-guide.tsx`
- Or Delete: `src/components/agent-connect-guide.tsx`
- Verify references with: `rg -n "AgentConnectGuide|agent-connect-guide" src`

**Step 1: Confirm whether the component is intentionally unused**

Run:

```bash
rg -n "AgentConnectGuide|agent-connect-guide" src
```

Expected: only the component definition exists.

**Step 2: Pick one path**

Preferred:
- If unused, delete it.
- If it will be surfaced later, update it to match the generated workflow in `src/lib/n8n-workflow-generator.ts`.

**Step 3: If keeping it, replace obsolete instructions**

The n8n guidance should describe the same dual-trigger architecture:

```ts
// webhook trigger + heartbeat trigger + AI agent + MCP tool
```

and must no longer imply a separate hand-rolled HTTP-only setup as the canonical experience.

**Step 4: Run verification**

Run:
- `pnpm typecheck`
- `pnpm lint`
- `rg -n "Schedule Trigger|get-briefing|get-community-signals" src/components`

Expected: one coherent story for proactive agents.

**Step 5: Commit**

```bash
git add src/components/agent-connect-guide.tsx
git commit -m "refactor(agent): align legacy connection guidance with shipped workflow"
```

### Final Verification

**Step 1: Run the full verification suite**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected:
- tests pass
- no type errors
- no lint errors
- production build succeeds

**Step 2: Run manual browser verification**

Check on desktop and mobile:

1. `/en`
2. `/en/auth/signup`
3. `/en/forum`
4. `/en/community`
5. `/en/impact`
6. authenticated `/en/dashboard`
7. authenticated `/en/dashboard/agent`
8. authenticated `/en/dashboard/notifications`

**Step 3: Commit the final integration pass**

```bash
git add .
git commit -m "fix: resolve reviewed UI and functional issues"
```
