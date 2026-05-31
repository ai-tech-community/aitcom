# Slice D — Activate (onboarding → first contribution + reciprocal response): Design

> Status: approved (2026-05-31). Next: `writing-plans` → `role:task` sub-issues under epic **#58**.

**Goal.** Make a newcomer's **activation** a first-class, admin-tunable outcome: drive them along the funnel **joined → first contribution → received a response (reciprocity) → activated**, guarantee a warm response so the reciprocity actually happens, and re-engage the un-activated before churn. Activation is community-policy (ADR-0013); agents advise, humans act (ADR-0015).

**Governing decisions:** `docs/adr/0013-hub-invariant-vs-community-policy.md` (activation milestone is admin-tunable community policy; default = first contribution + reciprocal response ≤~7d), `docs/adr/0015-community-surfaces-are-human-authored.md` (greeter replies are human-published; agent only drafts), **new `docs/adr/0017-activation-milestone-and-reciprocity.md`**, `CONTEXT.md` (Un-activated newcomer, Contribution action, Active member).

**GitHub:** Epic **#58** (Slice D). Tasks below become `role:task` sub-issues.

---

## Landscape (verified during planning)

Reuse, don't rebuild:
- **`activity_event` already has a `recipient_id` column** (`src/server/db/schema.ts`) and `logActivity` (`src/server/agent/activity.ts`) already accepts `recipientId` — it is simply **not populated** on reply/comment actions today. This is the reciprocity enabler; no new table needed for "response received".
- **Insight selectors (Slice A)** — `selectUnactivated`/`UnactivatedNewcomer`, `selectAtRisk`, `CONTRIBUTION_ACTIONS`, `windowStart` (`src/server/communities/insights.ts`, pure + tested). The un-activated cohort = active members joined 3–30d ago with zero contributions.
- **Warm-welcome (Slice C)** — `insights.sendWelcome` (organizer UI), `advisory.suggestWelcome` (agent draft), `sendDirectMessage` (`src/server/inbox/dm.ts`). Re-engagement reuses these wholesale.
- **`thread_reply` agent drafts + `reviewDraft`** — `agentDrafts` (type `thread_reply`) already publishes to the forum via `agent-management.reviewDraft` (owner-scoped). The greeter's "agent-draft a reply" reuses this end-to-end.
- **Per-community config pattern** — `community_engage_config` + `engageConfigRouter` (`src/server/api/routers/engageConfig.ts`, owner/admin `requireConfigAdmin`) is the exact template for `activationConfigRouter`.
- **Onboarding (hub-level)** — `onboardingRouter` + `memberProfiles.onboardingCompleted`/`interests`/`experienceLevel` + the `onboardingSteps` table (per-user, hub steps). D adds a **per-community** parallel; the per-user one is untouched.
- **Notifications (Slice B)** — the near-churn cron emits in-app notifications via the existing notifications infra.
- **Roles** — `communityProcedure` injects `ctx.communityRole`; gates: owner/admin (config + cron-adjacent), owner/admin/moderator (read funnel + greeter act), per `requireAdmin`/`requireConfigAdmin` helpers.

Genuinely new (this slice):
- Activation-milestone config (composable toggles + window).
- Reciprocity instrumentation (`recipientId` on response actions) + the "response received" query.
- Activation-status pure logic + funnel aggregation.
- The greeter awaiting-response queue + `suggestGreeting`.
- The near-churn cron.
- The admin-authored per-community onboarding wizard.

## Decisions locked (this brainstorm)
1. **Milestone = composable toggles + window:** `requireResponse` (default true), `requireProfileComplete` (default false), `windowDays` (default 7); `requireContribution` is the implicit baseline.
2. **Profile-complete = both:** `onboardingCompleted === true` AND (`interests.length ≥ 1` AND `experienceLevel` set).
3. **Response signal across all respondable surfaces:** instrument `recipientId` on `thread.reply`, `feed.comment_created`, `launchpad.comment.created`. `RESPONSE_ACTIONS` = those three. A response = event with `recipientId = member`, `actorId ≠ member`, action ∈ RESPONSE_ACTIONS.
4. **Greeter = awaiting-response queue + reply + agent-draft.** Surfaces a newcomer's earliest respondable contribution that is unanswered **after ~48h grace** and still within window. Reply-in-thread (organic) or `suggestGreeting` → `thread_reply` draft → `reviewDraft` publishes.
5. **Near-churn cron notifies community admins** (in-app) about un-activated newcomers joined ~23–30d ago; humans warm-welcome. No auto-DM.
6. **Onboarding wizard = admin-authored steps** (title + href, ordered) per community, with per-member completion tracking; member-facing checklist auto-hides once `activated`.
7. **Reciprocity is forward-only** — only events logged after this ships carry `recipientId`; no historical back-fill (documented).
8. **Tuned constants, not toggles:** 48h greeter grace; 23–30d near-churn window.

---

## Architecture (mirrors A/B/C: pure core + thin tRPC + thin cron/MCP + reuse)

1. **Pure core** — `src/server/communities/activation.ts` (`computeActivationStage`, `selectActivationFunnel`, `RESPONSE_ACTIONS`), vitest with injected clock, no DB.
2. **Schema** — 3 new `app` tables: `community_activation_config`, `community_onboarding_step`, `community_onboarding_progress`.
3. **Instrumentation** — set `recipientId` in the existing `logActivity` calls for the 3 response actions.
4. **Thin tRPC** — `activationConfigRouter` (get/set), `activationRouter` (funnel/awaitingResponse), `onboardingStepsRouter` (admin CRUD + member list/complete); extend `advisory` (`suggestGreeting`, `newcomersAwaitingResponse`).
5. **Thin cron** — `api/cron/newcomer-churn` (weekly admin notification).
6. **Thin MCP** — `newcomers-awaiting-response`, `suggest-greeting`.

### File structure
- Create `src/server/communities/activation.ts` (+ `.test.ts`) — stage + funnel logic, `RESPONSE_ACTIONS`.
- Modify `src/server/db/schema.ts` — 3 new tables.
- Create `src/migrations/2026053x_activation.ts` (+ register in `index.ts`).
- Create `src/server/api/routers/activationConfig.ts`, `activation.ts`, `onboardingSteps.ts`; register in `root.ts`.
- Modify `src/server/api/routers/advisory.ts` — `suggestGreeting`, `newcomersAwaitingResponse`.
- Modify the response-action `logActivity` call sites — `src/server/api/routers/forum.ts` (`thread.reply`), feed comment producer (`feed.comment_created`), launchpad comment producer (`launchpad.comment.created`) — set `recipientId` = content author.
- Create `src/app/api/cron/newcomer-churn/route.ts` + register in `vercel.json`.
- Modify `src/app/api/mcp/advisory-tools.ts` — 2 new tools.
- UI: activation funnel + awaiting-response queue in the insights dashboard; activation badge in member/newcomer lists; activation-config settings panel; onboarding admin authoring panel + member welcome checklist; `messages/*.json`.

## Data model
- **`community_activation_config`** (`app`): `communityId` pk → community, `requireResponse` bool default true, `requireProfileComplete` bool default false, `windowDays` int default 7, `updatedAt` timestamptz.
- **`community_onboarding_step`** (`app`): `id` pk, `communityId` → community, `title` varchar(255), `href` varchar(500), `position` int, `createdAt` timestamptz. Index `(communityId, position)`.
- **`community_onboarding_progress`** (`app`): `id` pk, `communityId` → community, `userId` → user, `stepId` → community_onboarding_step, `completedAt` timestamptz. Unique `(communityId, userId, stepId)`; index `(communityId, userId)`.
- Reuse `activity_event.recipientId` (existing) for reciprocity; `agentDrafts` (type `thread_reply`) for greeter drafts.

## Pure logic contract
```
type ActivationStage = "unactivated" | "awaiting_response" | "awaiting_profile" | "activated" | "stalled";
type ActivationConfig = { requireResponse: boolean; requireProfileComplete: boolean; windowDays: number };

computeActivationStage(opts: {
  joinedAt: Date;
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null; // earliest response with recipientId=member, actor≠member
  profileComplete: boolean;
  config: ActivationConfig;
  now: Date;
}): ActivationStage
```
Rules: no contribution → `unactivated`. Contributed: if `requireResponse` and no response within `windowDays` of `firstContributionAt` — `awaiting_response` while `now ≤ firstContributionAt + windowDays`, else `stalled`. If `requireProfileComplete` and `!profileComplete` → `awaiting_profile`. All required criteria met → `activated`. `selectActivationFunnel` buckets the 3–30d newcomer cohort into stage counts + returns the `awaiting_response` and `unactivated` member lists.

## Flows
**Reciprocity:** on reply/comment create, `logActivity({ action, recipientId: <content author>, ... })`. Activation queries derive `firstResponseReceivedAt` = `min(createdAt)` over events `recipientId=member, actorId≠member, action ∈ RESPONSE_ACTIONS`.

**Funnel (`activationRouter.funnel`):** load the newcomer cohort's memberships + first-contribution times (min CONTRIBUTION_ACTIONS event) + first-response times + profile-complete flags + config → `selectActivationFunnel` → stage counts.

**Greeter (`activationRouter.awaitingResponse`):** newcomers whose earliest respondable contribution (`thread.create`/`feed.post_created`) is unanswered, post age ≥ 48h, within window — joined to the thread/post for the link. UI: reply-in-thread or `advisory.suggestGreeting` (creates a `thread_reply` draft → `reviewDraft` publishes).

**Near-churn cron:** weekly; un-activated newcomers joined 23–30d ago → group by community → insert an in-app notification to each community's owner/admins.

**Onboarding:** admins author steps (`onboardingStepsRouter` CRUD/reorder); members see steps + their completion (`listForMe`) and `markComplete`; the member checklist hides when `computeActivationStage === "activated"`.

## ADR-0017 (new)
Activation milestone is community-policy with composable criteria (contribution baseline + optional response/profile + window); reciprocity is detected by populating `activity_event.recipientId` on response actions (forward-only); the greeter guarantees the reciprocal response (human-published, agent may draft a `thread_reply`); per-community onboarding steps are admin-authored. Builds on ADR-0013/0015.

## Testing
- **Pure (vitest, injected clock):** `computeActivationStage` (every stage + window-boundary + each toggle combination), `selectActivationFunnel` (bucketing + the two lists).
- **Thin:** tRPC/cron/MCP wrappers; reuse the insights/advisory/digest test patterns.
- Mirrors A/B/C: logic in pure cores, glue minimal.

## Task decomposition (→ `writing-plans` formalizes as `role:task` sub-issues under #58)
1. **Activation config** — `community_activation_config` + migration + `activationConfigRouter` + settings UI.
2. **Reciprocity instrumentation** — `recipientId` on `thread.reply`/`feed.comment_created`/`launchpad.comment.created` + `RESPONSE_ACTIONS`.
3. **Activation pure logic** — `computeActivationStage` + `selectActivationFunnel` (vitest).
4. **Activation tRPC** — `funnel` + `awaitingResponse` + the first-contribution/first-response/respondable-post queries.
5. **Funnel dashboard + member status badges.**
6. **Greeter** — `advisory.suggestGreeting` + `newcomersAwaitingResponse` + MCP + queue UI (reply + agent-draft).
7. **Near-churn cron** — notify admins (reuse notifications).
8. **Onboarding wizard backend** — 2 tables + migration + `onboardingStepsRouter` (admin CRUD/reorder + member list/complete).
9. **Onboarding UI** — admin authoring panel + member welcome checklist (hides when activated).
10. **ADR-0017 + CONTEXT.md + integration verification.**

## Open calls (correctable at spec review)
- Activation-config + onboarding-step authoring gated **owner/admin**; funnel/awaiting-response read + greeter act allow **moderator**.
- 48h greeter grace and 23–30d near-churn window are tuned constants, not admin toggles.
- Reciprocity is **forward-only** (no historical back-fill).
- The member onboarding checklist **auto-hides once `activated`**.
