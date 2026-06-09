# Hackathon Layer — Plan 3: Spectator View & UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Give humans the surfaces to run and watch a hackathon: a hackathon panel on the event page (create/join team, your team + submit, sponsor finalize), a public team leaderboard, and a read-only team grid view — the **Spectator view** (ADR-0030): the *race*, never the *work*.

**Architecture:** Mostly frontend (Next.js App Router, server components fetching Payload + `<HydrateClient>`, client components calling `api.*.useQuery/useMutation` with `sonner` toasts, shadcn/ui + Tailwind, next-intl). Two small backend queries support it. The leaderboard reuses Plan 2's `hackathon.teamLeaderboard`. The spectator's "watch progress" shows **aggregate cell status counts, never `output`** (ADR-0030).

**Verification reality:** there is **no local DB/app** here, so UI is **typecheck-verified only** — visual/functional verification is deferred to a session that can run `pnpm dev` against a DB. The two backend queries + the already-shipped `isPublic` fix ARE verifiable.

**i18n:** every user-facing string needs a key in BOTH `messages/en.json` and `messages/nl.json` under a new `hackathon` section.

**Status of Phase A:** the challenge-leaderboard `isPublic` fix is **already shipped** on this branch (commit `809eafd`).

---

## Phase A — `isPublic` leaderboard fix ✅ DONE

`challenges.getLeaderboard` now masks non-public members (rank kept, name+avatar → "Anonymous"), per ADR-0021/0030. Shipped on `feat/hackathon-layer-spectator`. No further action.

---

## Phase B — Spectator backend queries (verifiable)

### Task B1: `hackathon.myTeam` + `hackathon.teamGridStatus`

**Files:** Modify `src/server/api/routers/hackathon.ts`.

- [ ] **Step 1: `myTeam` (the caller's team for a challenge, for create/join UI state)**

```typescript
  /** The caller's team for a hackathon challenge (null if none) + roster. */
  myTeam: protectedProcedure
    .input(z.object({ challengeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [enrollment] = await ctx.db
        .select({ teamId: challengeEnrollments.teamId })
        .from(challengeEnrollments)
        .where(
          and(
            eq(challengeEnrollments.userId, userId),
            eq(challengeEnrollments.challengeId, input.challengeId),
          ),
        )
        .limit(1);
      if (!enrollment?.teamId) return null;

      const [team] = await ctx.db
        .select()
        .from(teams)
        .where(eq(teams.id, enrollment.teamId))
        .limit(1);
      if (!team) return null;

      const members = await ctx.db
        .select({
          userId: challengeEnrollments.userId,
          displayName: memberProfiles.displayName,
        })
        .from(challengeEnrollments)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, challengeEnrollments.userId),
        )
        .where(eq(challengeEnrollments.teamId, team.id));

      return { team, members, isCaptain: team.captainId === userId };
    }),
```

- [ ] **Step 2: `teamGridStatus` (aggregate cell counts — NEVER outputs; ADR-0030)**

```typescript
  /**
   * Public, aggregate progress for a team's competitive grid — the spectator
   * "watch the race" projection (ADR-0030): cell status COUNTS only, never a
   * cell's output or content.
   */
  teamGridStatus: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [grid] = await ctx.db
        .select({ id: workGrids.id })
        .from(workGrids)
        .where(
          and(eq(workGrids.teamId, input.teamId), eq(workGrids.mode, "competitive")),
        )
        .limit(1);
      if (!grid) return { total: 0, byStatus: {} as Record<string, number> };

      const cells = await ctx.db
        .select({ status: workCells.status })
        .from(workCells)
        .where(eq(workCells.gridId, grid.id));

      const byStatus: Record<string, number> = {};
      for (const c of cells) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      return { total: cells.length, byStatus };
    }),
```

- [ ] **Step 3: Typecheck + commit** (`pnpm typecheck` → 0)

```bash
git add src/server/api/routers/hackathon.ts
git commit -m "feat(hackathon): spectator backend queries — myTeam + teamGridStatus (Plan 3)"
```

---

## Phase C — i18n keys

### Task C1: Add the `hackathon` message section

**Files:** Modify `messages/en.json` and `messages/nl.json`.

- [ ] **Step 1: Add to `messages/en.json`** a top-level `"hackathon"` object:

```json
"hackathon": {
  "title": "Hackathon",
  "leaderboard": "Leaderboard",
  "yourTeam": "Your team",
  "createTeam": "Create a team",
  "joinTeam": "Join a team",
  "teamName": "Team name",
  "joinCode": "Join code",
  "create": "Create",
  "join": "Join",
  "leave": "Leave team",
  "submit": "Submit team",
  "submitted": "Submitted",
  "captain": "Captain",
  "members": "Members",
  "artifactUrl": "Project link (optional)",
  "artifactSummary": "Summary (optional)",
  "finalize": "Finalize hackathon",
  "rank": "Rank",
  "score": "Score",
  "progress": "Progress",
  "cellsDone": "{done}/{total} cells",
  "rosterLocked": "Rosters are locked",
  "winner": "Winner",
  "anonymous": "Anonymous"
}
```

- [ ] **Step 2: Add the same keys to `messages/nl.json`** with Dutch translations:

```json
"hackathon": {
  "title": "Hackathon",
  "leaderboard": "Klassement",
  "yourTeam": "Jouw team",
  "createTeam": "Maak een team",
  "joinTeam": "Sluit je aan bij een team",
  "teamName": "Teamnaam",
  "joinCode": "Toetredingscode",
  "create": "Aanmaken",
  "join": "Deelnemen",
  "leave": "Team verlaten",
  "submit": "Team inzenden",
  "submitted": "Ingezonden",
  "captain": "Aanvoerder",
  "members": "Leden",
  "artifactUrl": "Projectlink (optioneel)",
  "artifactSummary": "Samenvatting (optioneel)",
  "finalize": "Hackathon afronden",
  "rank": "Positie",
  "score": "Score",
  "progress": "Voortgang",
  "cellsDone": "{done}/{total} cellen",
  "rosterLocked": "Teams zijn vergrendeld",
  "winner": "Winnaar",
  "anonymous": "Anoniem"
}
```

- [ ] **Step 3: Commit** (no typecheck needed for JSON, but run `pnpm typecheck` to be safe)

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(hackathon): i18n keys for the hackathon UI (Plan 3)"
```

---

## Phase D — UI components (typecheck-only; visual verification deferred)

> Each component is a `"use client"` component using `api` from `@/trpc/react`, `useTranslations("hackathon")`, shadcn/ui primitives, and `toast` from `sonner` — mirroring `event-register-button.tsx` / `challenge-leaderboard.tsx` / `profile-edit-form.tsx`.

### Task D1: `TeamLeaderboard` component

**Files:** Create `src/components/hackathon/team-leaderboard.tsx`.

- [ ] Implement (wraps `api.hackathon.teamLeaderboard.useQuery({ challengeId })`): a ranked list of `{ name, score, finalRank, memberCount, memberFaces }`, showing `#rank`, name, score, and member faces (public names + `+N` overflow for the private count = `memberCount - memberFaces.length`). Mirror `challenge-leaderboard.tsx` styling. Show a `Winner` badge on `finalRank === 1`. Returns null while loading/empty.

### Task D2: `TeamGridProgress` component (spectator race view)

**Files:** Create `src/components/hackathon/team-grid-progress.tsx`.

- [ ] Implement (wraps `api.hackathon.teamGridStatus.useQuery({ teamId })`): a `Progress` bar = completed/total, plus small status-count chips (pending/claimed/completed/failed). **Never renders any cell output** — only counts. Uses `t("cellsDone", { done, total })`.

### Task D3: `HackathonPanel` (create/join/your-team/submit/finalize)

**Files:** Create `src/components/hackathon/hackathon-panel.tsx`.

- [ ] Implement the member-facing control surface, composed of:
  - If `api.hackathon.myTeam.useQuery({ challengeId })` is null → a `CreateTeam` form (`createTeam` mutation) + a `JoinTeam` form (`joinTeam` mutation by code), each with `toast` + `utils.hackathon.myTeam.invalidate()`.
  - If on a team → show the roster (`members`), the `joinCode` (captain only), `TeamGridProgress`, a `leaveTeam` button (non-captain, forming only), and — captain + `status==='locked'` + not submitted — a `submitTeam` form (artifactUrl/summary).
  - If the viewer is the challenge sponsor (passed as a prop `isSponsor`), a `finalizeHackathon` button (guarded by a confirm `Dialog`).
  - Always: `<TeamLeaderboard challengeId={challengeId} />`.
  - Auth-gating via `authClient.useSession()` (mirror `community/[slug]/layout.tsx`); logged-out viewers see only the leaderboard + progress (the spectator view).

### Task D4: Mount on the event page

**Files:** Modify `src/app/[locale]/events/[slug]/page.tsx`.

- [ ] When the event has a `challengeId` (it's a hackathon), render `<HackathonPanel challengeId={Number(event.challengeId)} isSponsor={...} />` in a section. Compute `isSponsor` server-side (challenge `creatorId === session user id`) or pass the challenge creatorId and let the panel compare against the session. Keep the existing event content; add the panel below it.

- [ ] **Verify:** `pnpm typecheck` → 0; `pnpm test` → unchanged. Commit each component separately. **Do NOT claim visual correctness** — note in the PR that the UI is typecheck-verified only and needs a running app to validate.

---

## Self-Review / Coverage

- Spectator view (public: leaderboard + aggregate progress, no outputs, isPublic-respecting) → D1, D2 + the `isPublic` fix (Phase A) + `teamGridStatus` (B1). ✓
- Member control surface (create/join/leave/submit) → D3. ✓
- Sponsor finalize button → D3. ✓
- Mounted on the hackathon (event) page → D4. ✓
- i18n → C1. ✓

**Deferred:** live ticker, Launchpad post-event showcase, animated grid, dedicated `/hackathons/[slug]` route (the event-page panel suffices for MVP).

**Honest limitation:** D1–D4 are typecheck-only here; visual/interaction correctness, responsive layout, and the Dutch translations' quality need a human + a running app. Phase A/B and the i18n key presence are the verifiable parts.

---

## Execution Handoff

Because the UI cannot be run/verified in this environment, recommended order: do **Phase B** (verifiable backend queries) and **Phase C** (i18n) now; build **Phase D** components typecheck-clean but treat them as drafts to validate when the app can run. Subagent-driven per task.
