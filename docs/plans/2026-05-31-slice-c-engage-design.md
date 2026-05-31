# Slice C — Engage (rituals + digest recall + revival/welcome loop): Design

> Status: approved (2026-05-31). Next: `writing-plans` → `role:task` sub-issues under epic **#57**.

**Goal.** Close the Engage loop — **Ritual → content → digest recall → participation → Ritual** — by adding the missing *supply* and *recall* arms on top of the A/B/F foundation. Organizers get a reliable community **heartbeat** (rituals), members get pulled back by **digest recall**, quiet members get a **revival/welcome** touch — all human-authored or human-published per [[community-surfaces-are-human-authored]] (ADR-0015).

**Governing decisions:** `docs/adr/0014-consolidated-digest-broadcast-ceiling.md` (consolidated digest + broadcast ceiling, agent may draft broadcasts), `docs/adr/0015-community-surfaces-are-human-authored.md` (agents advise, humans publish), **new `docs/adr/0016-engage-loop-rituals-recall.md`** (rituals are system-posted structural scaffolding; digest recall config; community-scoped role-gated draft queue), `CONTEXT.md` (Ritual, Community digest, Hub digest, Broadcast).

**GitHub:** Epic **#57** (Slice C). Tasks below become `role:task` sub-issues.

---

## Landscape (verified during planning)

Reuse, don't rebuild:
- **Digest pipeline (Slice B)** — `src/server/notifications/digest.ts` exposes `CommunitySectionInput.ritualItems: string[]` (the empty typed slot Slice C fills), `summarizeCommunitySection` (ritualItems already counts toward `isEmpty`), `buildHubDigest` (opt-out + empty suppression). Assembled in `src/app/api/cron/hub-digest/route.ts`.
- **Broadcast send (Slice B)** — `broadcastRouter` (`src/server/api/routers/broadcast.ts`) owns compose→send: owner/admin gate (`ctx.communityRole`), per-community opt-out, ceiling (`allowPromotional`/`perCommunitySubCap` in `notifications/ceiling.ts`, `BROADCAST_CEILING=3`), `broadcastDeliveries` window dedup, `sendBroadcastEmail`. **Reuse this path on draft-approve — do not reimplement.**
- **Advisory drafts (Slice F)** — `agent_draft` (`schema.ts:669`, status `pending|approved|rejected`, free-form `type`) + `advisory.suggestRevival` (type `revival_nudge`) + `agent-management.reviewDraft` (approve→act; revival branch opens/sends an organizer→member DM with dedup). MCP advisory tools in `src/app/api/mcp/advisory-tools.ts`.
- **Insights (Slice A)** — `insights.ts` `selectAtRisk` → `AtRiskMember` and `selectUnactivated` → `UnactivatedNewcomer` (pure, tested). `advisory.atRiskMembers` (agentProcedure) is the consume pattern; **no agent-scoped `unactivatedNewcomers` yet** (only the protected dashboard one).
- **Roles** — `role-utils.ts` (`CommunityRole`, `ROLE_HIERARCHY`, `canManageRole`), `ctx.communityRole` in community-scoped procedures. Existing gates: broadcast = owner/admin; insights read = owner/admin/moderator.
- **Forum threads** — Payload `forum_threads` collection (`author`, `author_role`, `category`, `community`, lexical `content`); `plainTextToLexical` helper (`src/server/api/routers/forum.ts` et al.). `reviewDraft`'s `thread_reply` branch is the `payload.create` pattern.
- **MCP** — tool modules registered via `register*Tools(server, caller, keyData)` in `src/app/api/mcp/route.ts`; thin wrappers over tRPC callers.
- **Migrations** — `src/migrations/<key>.ts` (`up`/`down`, `sql` from `@payloadcms/db-postgres`, `app` schema) + register in `index.ts` (import + last array entry). FK targets: `app.community`, `app.user`, `app.agent_profile`, `app.conversation`.

Genuinely missing (this slice):
- **Rituals** — no entity, schedule, materialization, or agent draft path. Only the empty digest slot.
- **Digest recall content** — `ritualItems` ships empty; no per-community config of what fills it.
- **Warm-welcome** — `selectUnactivated` is surfaced in the dashboard but has **no draft→DM flow** and no agent-scoped endpoint.
- **Agent-drafted broadcast** — broadcasts are human-composed only; no `suggestBroadcast` (an ADR-0014 gap).

## Decisions locked (this brainstorm)
1. **Four pieces ship:** (A) Rituals, (B) digest recall, (C) warm-welcome, (D) agent-drafted broadcast.
2. **Rituals materialize as `forum_threads`** (members reply → content → participation).
3. **Hybrid posting:** each ritual carries `mode ∈ {auto, review}`. `auto` posts on schedule; `review` creates a pending occurrence an admin approves before it posts.
4. **Cadence = weekly + weekday** (one weekday 0–6 per ritual; daily cron fires matches).
5. **Author-of-record = `author_user_id`** (the admin whose name the thread posts under), stored separately from *who may manage* the ritual.
6. **Agent touchpoint = ritual definitions only** (`suggestRitual` → admin approves → ritual created). Occurrences then follow the approved template per the auto/review toggle. Agent never posts; rituals are structural scaffolding, not agent-authored conversational content (ADR-0015 satisfied).
7. **Digest recall is admin-configurable** per community: toggles `ritual_recap`, `ritual_reminder`, `at_risk_line`. Defaults: recap ON, reminder ON, at-risk OFF (privacy-sensitive → opt-in).
8. **Warm-welcome is dual-triggered:** agent path (`suggestWelcome` → draft → DM) **and** organizer-UI path (compose + send DM directly from the un-activated list).
9. **Agent-drafted broadcast:** `suggestBroadcast` → draft → admin approves → reuse `broadcastRouter` send (ceiling enforced at send time).
10. **Permission model (multi-admin):**
    - **owner/admin/moderator:** create/edit/pause rituals, approve review occurrences, send welcome DMs.
    - **owner/admin:** configure digest toggles, draft/send broadcasts.
    - **Draft queue is community-scoped** — any qualifying admin of `metadata.communityId` may review/act (gate by `ctx.communityRole`, not `ownerId`); `agentId`/`ownerId` are provenance only. Applies to new Slice C draft types; Slice F revival/intro stay owner-scoped (follow-up to unify).
11. **Stale review occurrences supersede:** when a ritual is next due and a prior occurrence is still `pending`, mark it `skipped` (logged) and create a fresh one — the heartbeat stays current rather than queuing.

---

## Architecture (mirrors A/B/F: pure core + thin tRPC + thin cron/MCP + reuse)

1. **Pure core** — `src/server/communities/rituals.ts` (`isRitualDue`, `nextFireDate`, occurrence state transitions) + `src/server/notifications/ritual-items.ts` (`buildRitualItems`), both vitest-tested with injected clock, no DB.
2. **Schema** — 3 new `app` tables: `ritual`, `ritual_occurrence`, `community_engage_config`.
3. **Thin tRPC** — `rituals` router (manage + approve + reviewSuggestion), `engageConfig` (get/set toggles), `welcome.send` (organizer-UI direct DM); extend `advisory` (suggestRitual, unactivatedNewcomers, suggestWelcome, suggestBroadcast) and `agent-management.reviewDraft` (welcome_nudge + broadcast branches).
4. **Thin cron** — `api/cron/rituals` (daily fire); `api/cron/hub-digest` extended to fill `ritualItems`.
5. **Thin MCP** — `propose-ritual`, `get-unactivated-newcomers`, `suggest-welcome`, `suggest-broadcast`.

### File structure
- Create `src/server/communities/rituals.ts` (+ `.test.ts`) — due/cadence + occurrence transitions.
- Create `src/server/notifications/ritual-items.ts` (+ `.test.ts`) — `buildRitualItems`.
- Modify `src/server/db/schema.ts` — `ritual`, `ritual_occurrence`, `community_engage_config` tables.
- Create `src/migrations/2026053x_engage_rituals.ts` (+ register in `index.ts`).
- Create `src/app/api/cron/rituals/route.ts` — daily fire (claim-guarded; Payload thread create for `auto`/approved).
- Modify `src/app/api/cron/hub-digest/route.ts` — populate `ritualItems` from config + occurrences + at-risk set.
- Create `src/server/api/routers/rituals.ts` (manage/approve/reviewSuggestion) + `engageConfig.ts` (toggles); register in `root.ts`.
- Modify `src/server/api/routers/advisory.ts` — `unactivatedNewcomers`, `suggestRitual`, `suggestWelcome`, `suggestBroadcast`.
- Modify `src/server/api/routers/agent-management.ts` — extend `reviewDraft` (`welcome_nudge` → DM via shared helper; `broadcast` → broadcast send) + `welcome.send` (or a small `welcome` router); extract `sendOrganizerDM(db, fromUserId, toUserId, content)` shared with the revival branch.
- Modify `src/app/api/mcp/advisory-tools.ts` (+ `route.ts` if a new module) — 4 new tools.
- UI: rituals admin surface (list/create/edit/pause + pending-occurrence approval); digest toggles in community settings; "draft/send welcome" on the existing un-activated list; broadcast-draft review in the drafts surface; `messages/*.json`.

## Data model
- **`ritual`** (`app`): `id` pk, `communityId`→community, `authorUserId`→user (author-of-record), `suggestedByAgentId`→agentProfiles (nullable, provenance), `title` varchar, `body` text, `weekday` int (0–6), `mode` varchar(10) (`auto`|`review`), `status` varchar(10) (`active`|`paused`, default `active`), `lastFiredOn` date (nullable; CAS claim), `createdAt`. Indexes: `(communityId)`, `(status, weekday)`.
- **`ritual_occurrence`** (`app`): `id` pk, `ritualId`→ritual, `communityId`→community, `scheduledFor` date, `status` varchar(10) (`pending`|`posted`|`skipped`), `threadId` int→forum_threads (nullable), `createdAt`, `postedAt` (nullable). **Unique `(ritualId, scheduledFor)`** = double-fire claim guard. Index `(communityId, status)`.
- **`community_engage_config`** (`app`): `communityId`→community **pk**, `ritualRecap` bool default true, `ritualReminder` bool default true, `atRiskLine` bool default false, `updatedAt`. Absent row ⇒ defaults.
- Reuse `agent_draft` for new types: `ritual_suggestion` (metadata = full definition `{communityId, title, body, weekday, mode}`), `welcome_nudge` (targetType `user`, targetId newcomer, content = message, metadata `{communityId}`), `broadcast` (targetType `community`, targetId communityId, content = body, metadata `{communityId, subject}`).

## Flows

**Ritual fire (cron, daily).** For each `active` ritual where `isRitualDue(ritual, today)` (weekday matches & `lastFiredOn < today`): CAS-claim by `UPDATE ritual SET lastFiredOn=today WHERE id=? AND (lastFiredOn IS NULL OR lastFiredOn < today)`; the unique `(ritualId, scheduledFor)` on occurrence insert absorbs any race. Then: supersede any still-`pending` occurrence for this ritual (→ `skipped`, logged); `auto` → `payload.create` a `forum_threads` (author = `authorUserId`, role from membership, lexical body) + occurrence `posted` w/ `threadId`; `review` → occurrence `pending` + notify community admins.

**Approve review occurrence (tRPC, owner/admin/moderator).** Posts the thread (same Payload create) and flips occurrence `pending`→`posted`. `skipOccurrence` → `skipped`.

**Digest recall (hub-digest cron).** Per community: read `community_engage_config`; if `ritualRecap`, summarize this-week `posted` occurrences (title + reply count from `forum_threads`/replies); if `ritualReminder`, compute `nextFireDate` per active ritual; if `atRiskLine`, compute `selectAtRisk` once for the community. Per recipient: `buildRitualItems({config, recap, reminder, recipientIsAtRisk, recipientName})` → `ritualItems`. Existing `summarizeCommunitySection`/`buildHubDigest` handle empty/opt-out suppression.

**Warm-welcome.** Agent: `advisory.unactivatedNewcomers` (read) + `advisory.suggestWelcome` → `welcome_nudge` draft → admin `reviewDraft` approve → `sendOrganizerDM`. Organizer-UI: `welcome.send` (owner/admin/moderator) composes + `sendOrganizerDM` directly (pre-filled template, no draft).

**Agent-drafted broadcast.** `advisory.suggestBroadcast` → `broadcast` draft → admin (owner/admin) `reviewDraft` approve → calls `broadcastRouter` send (ceiling + delivery dedup + email reused).

## ADR-0016 (new)
Captures: (1) rituals are **structural scaffolding** the system posts in an admin's name — not agent-authored conversational content, so ADR-0015's always-draft rule is met by the agent only drafting *definitions*; (2) **hybrid auto/review** posting; (3) **admin-configurable digest recall** (recap/reminder/at-risk toggles, at-risk opt-in); (4) **community-scoped, role-gated draft queue** (any qualifying admin acts) — the multi-admin reality. Supersedes the single-owner assumption of Slice F for the new draft types.

## Testing
- **Pure (vitest, injected clock):** `isRitualDue`/`nextFireDate`/occurrence transitions; `buildRitualItems` (each toggle combo + at-risk recipient). 
- **Thin:** cron/tRPC/MCP wrappers; reuse the ceiling/DM/digest test patterns.
- Mirrors A/B/F: logic in pure cores, glue stays minimal.

## Task decomposition (→ `writing-plans` formalizes as `role:task` sub-issues under #57)
1. **Ritual core** — schema + migration + `rituals.ts` pure logic (due/cadence/transitions).
2. **Ritual cron + materialization** — `api/cron/rituals` (auto/review, claim-guard, supersede, Payload thread create).
3. **Ritual tRPC + agent + UI** — `rituals` router, `advisory.suggestRitual` + `reviewSuggestion`, MCP `propose-ritual`, admin dashboard surface.
4. **Digest recall** — `community_engage_config` + `buildRitualItems` + hub-digest wiring + `engageConfig` tRPC + toggles UI.
5. **Warm-welcome** — `advisory.unactivatedNewcomers`/`suggestWelcome`, `welcome.send`, `sendOrganizerDM` extraction, `reviewDraft` welcome branch, MCP tools, un-activated-list UI.
6. **Agent-drafted broadcast** — `advisory.suggestBroadcast`, `reviewDraft` broadcast branch (reuse send), MCP tool, draft-review UI.
7. **ADR-0016 + CONTEXT.md** — ritual lifecycle, engage config, draft-queue scoping.

## Open calls (correctable at spec review)
- Digest-config gated at **owner/admin** (config affects all members + the at-risk toggle touches sensitive data), while rituals/welcomes include moderators.
- Stale review occurrences **supersede** rather than queue.
- Slice F revival/intro drafts stay **owner-scoped** for now; unify to community-scoped as a follow-up.
