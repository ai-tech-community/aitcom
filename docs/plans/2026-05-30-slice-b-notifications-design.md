# Slice B — Notifications infra: Design

> Status: approved (2026-05-30). Next: `writing-plans` → `role:task` sub-issues under epic **#55**.

**Goal.** Govern member-facing notification volume at the **Hub** level: one consolidated weekly [[hub-digest]] email per member (a [[community-digest]] section per community), a community-admin [[broadcast]] channel bounded by a Hub-wide fair-shared [[notification-ceiling]], transactional event messages that bypass the ceiling, and a single preference center — reusing the existing Resend / Vercel-cron / `notification` rails.

**Governing decisions:** `docs/adr/0014-consolidated-digest-broadcast-ceiling.md`, `docs/adr/0013-hub-invariant-vs-community-policy.md`, `docs/adr/0015-community-surfaces-are-human-authored.md`. **Domain:** `CONTEXT.md`.

**GitHub:** Epic **#55** (Slice B). Tasks below become `role:task` sub-issues.

---

## Landscape correction (the epic's "greenfield" claim is wrong)

Verified during planning — Slice B **reuses**, not rebuilds:

- **Email transport** — Resend wired via `@payloadcms/email-resend` (`src/payload.config.ts:162`); ~9 transactional senders in `src/server/email.ts` (hand-rolled HTML, English-only).
- **In-app notifications** — `notification` table (`src/server/db/schema.ts:425`, has a `communityId` column) + `notifications` tRPC router (`src/server/api/routers/notifications.ts`). Bell UI is unbuilt (pre-existing deferred work, **not** Slice B).
- **Scheduling** — Vercel cron (`vercel.json` crons → `src/app/api/cron/*/route.ts`, `CRON_SECRET` bearer auth). 7 crons live; 3 already write to `notification`.
- **Agent seam** — `agent_draft` / `agent_suggestion` tables exist (`schema.ts:535/562`) — the ADR-0015 "Suggest" hook Slice F wires.

**Genuinely greenfield:** notification **preferences** (no fields on `member_profile`), the consolidated **digest pipeline**, the **broadcast sender + ceiling**, and a **Hub-operator** role (only community roles exist today).

## Decisions locked (this brainstorm)

1. **Ceiling overflow → drop the email for that member** (member's inbox is protected); the in-app notification is still created. No defer/queue — broadcasts are time-sensitive, stale delivery is worse than none.
2. **Fair-share → per-community sub-cap** = `max(1, floor(CEILING / N_communities))`, with the global `CEILING` enforced on top. No single fast-sending community can monopolize a member's weekly budget.
3. **Channels → digest = email only; broadcast = in-app notification + email** (email ceiling-gated for promotional, exempt for transactional).
4. **Events are sacred.** Messages to members who already have a relationship with a specific event (RSVP'd / registered) are **transactional → exempt and never dropped**. Admin free-text broadcasts are **promotional → ceiling-limited**. `transactional` is system-reserved (closes the self-labelling abuse hole).
5. **Event consumer scope → mechanism + one live consumer**: build `sendTransactional()` and wire **event reminders to RSVP'd members**; broader event notifications out of scope.
6. **Hub-operator → constants now + thin gate**: ship the ceiling/cadence as Hub-invariant constants and a `requireHubOperator()` gate (root `ait` owner/admin) where the knobs will live; **full Hub-operator role + settings UI is its own epic** (linked from #55).
7. **i18n/locale → deferred**: no per-member locale field exists; emails render English, structured for per-member locale later.

---

## Architecture (mirrors Slice A: pure core + thin tRPC + thin cron)

1. **Pure core** — `src/server/notifications/*.ts`, no DB / injected clock, vitest-tested: ceiling allocation, digest assembly, section summarization, preference resolution.
2. **Thin tRPC routers** — `broadcast`, `notificationPrefs`; DB in → pure fns → DB out.
3. **Thin cron route handlers** — `/api/cron/hub-digest` (weekly), `/api/cron/event-reminders` (daily); `CRON_SECRET`-gated; send through `src/server/email.ts` (Resend).
4. **Hub-invariant constants + seam** — `src/server/notifications/constants.ts` + `requireHubOperator(ctx)`.

### File structure

- Create `src/server/notifications/constants.ts` — Hub-invariant constants.
- Create `src/server/notifications/ceiling.ts` (+ `.test.ts`) — `allowPromotional`, fair-share.
- Create `src/server/notifications/digest.ts` (+ `.test.ts`) — `summarizeCommunitySection`, `buildHubDigest`.
- Create `src/server/notifications/prefs.ts` (+ `.test.ts`) — `resolvePrefs`, opt-out helpers.
- Create `src/server/notifications/render.ts` — digest/broadcast HTML (extends `email.ts` style).
- Create `src/server/api/routers/broadcast.ts`, `src/server/api/routers/notificationPrefs.ts`; register in `src/server/api/root.ts`.
- Modify `src/server/email.ts` — add `sendTransactional` / `sendBroadcastEmail` / `sendHubDigest` senders + `requireHubOperator` is in trpc helpers.
- Create `src/app/api/cron/hub-digest/route.ts`, `src/app/api/cron/event-reminders/route.ts`; modify `vercel.json`.
- Create migrations under `src/migrations/` (+ register in `src/migrations/index.ts`).
- UI: preference center page + broadcast composer under `src/app/[locale]/...` + `src/components/...`; admin nav entry.
- `messages/en.json` (+ `nl.json`) — UI strings (not email bodies this slice).

## Data model (new Drizzle tables, `app` schema)

- **`notification_optout`** — sparse opt-OUT rows `(id, userId, communityId nullable, category, createdAt)`, `category ∈ {digest, broadcast}`, `communityId = null` ⇒ global. **Absence = opted in** (digests default opt-in per ADR-0014). One-click opt-out = insert; opt back in = delete. Unique `(userId, communityId, category)`.
- **`broadcast`** — `(id, communityId, authorId, subject, body, class, createdAt, sentAt)`, `class ∈ {promotional, transactional}`.
- **`broadcast_delivery`** — per-recipient ledger `(id, broadcastId, userId, communityId, class, emailSent bool, windowKey, createdAt)`. Ceiling source of truth (count `emailSent && class='promotional'` per `(userId, windowKey)`) **and** resend idempotency. Index `(userId, windowKey)`.
- **`digest_send_log`** — `(userId, periodKey)` unique — weekly digest idempotency.

Reused as-is: `notification` (in-app, `communityId`), `user.email`, `member_profile.displayName`, `community_membership` (active members), `event_registration` (`eventId` int → Payload events, `status`).

## The four flows

### 1 · Consolidated Hub digest (email only) — weekly cron

```
for member in all active members:
  communities = active memberships(member)
  sections = []
  for c in communities:
    if optedOut(member, c, 'digest'): continue
    section = summarizeCommunitySection(windowActivity(c))   # pure
    # new threads, new events, new members; + typed empty `ritualItems` slot (Slice C fills)
    sections.push(section)
  digest = buildHubDigest(member, sections, prefs)            # pure: drop empty/opted-out; null if nothing
  if digest == null or optedOut(member, null, 'digest'): continue
  if alreadySent(member, periodKey): continue                 # digest_send_log
  send Resend email(render(digest))                           # English
  write digest_send_log(member, periodKey)
```

### 2 · Broadcast + ceiling (in-app + email) — `broadcast.send`, admin/owner-gated

```
broadcast = create(communityId, author, subject, body, class='promotional')  # admins compose promotional only
for member in active members(community):
  if optedOut(member, community, 'broadcast'): continue
  createInAppNotification(member, broadcast)                  # always (pull, non-intrusive)
  if class == 'transactional':
    emailSent = sendBroadcastEmail(member); ledger(emailSent=true)            # exempt
  else:
    sends = promotionalSendsThisWindow(member)                # broadcast_delivery
    if allowPromotional(sends, member.communityCount, CEILING):   # pure: per-community sub-cap + global cap
      emailSent = sendBroadcastEmail(member); ledger(emailSent=true)
    else:
      ledger(emailSent=false)                                 # email suppressed; in-app already created
```

`allowPromotional(sendsByCommunity, nCommunities, ceiling)` → bool. Per-community sub-cap `max(1, floor(ceiling / nCommunities))`; reject if this community is at its sub-cap **or** the member's global promotional count ≥ ceiling.

### 3 · Event transactional consumer ("never miss events") — daily cron `/api/cron/event-reminders`

```
events = Payload events starting within EVENT_REMINDER_LEAD_HOURS
for e in events:
  regs = event_registration(e.id, status in ['registered','waitlisted'])
  for r in regs:
    if alreadyReminded(r.userId, e.id): continue              # broadcast_delivery dedupe key
    sendTransactional(r.userId, e)                            # in-app + email, ceiling-EXEMPT
```

### 4 · Preference center — `notificationPrefs` router + member page

Global digest toggle, per-community digest section toggles, per-community broadcast toggle. Reads/writes `notification_optout`. `resolvePrefs(optoutRows)` (pure) is the single resolver consumed by both the digest builder and the broadcast fan-out.

## Hub-invariant constants (`constants.ts`)

```
BROADCAST_CEILING = 3            // promotional emails / member / window
CEILING_WINDOW_DAYS = 7
DIGEST_CADENCE = 'weekly'
EVENT_REMINDER_LEAD_HOURS = 24
```

`requireHubOperator(ctx)` — owner/admin of the root `ait` community; guards a stubbed settings read. Full role + tunable UI = separate epic.

## Testing

Pure functions carry coverage (vitest, injected clock — Slice A style):
- `allowPromotional` — under / at / over cap; fair-share across N communities; transactional bypass; single-community edge (`N=1` ⇒ sub-cap = ceiling).
- `buildHubDigest` — empty-section suppression, opt-out filtering, `null` when nothing.
- `summarizeCommunitySection`, `resolvePrefs`.

Routers/crons: manual end-to-end verification (send a broadcast; run the digest cron over seed data) — no DB harness exists, same as Slice A.

## Tracer-bullet task order

**Phase B1 (prefs + digest):** constants + pure ceiling → pure digest/section/prefs → schema + migrations → `notificationPrefs` router + preference UI → digest render + `/api/cron/hub-digest`.
**Phase B2 (broadcast + ceiling + events):** `broadcast` router (in-app + ceiling-gated email) → broadcast composer UI + admin nav → `/api/cron/event-reminders` (transactional consumer) → `requireHubOperator` seam + constants wiring.

## Out of scope (noted for epic #55)

- Per-member locale / i18n **email bodies** (no locale field — English now).
- Rich digest content from rituals/revival prompts (Slice C fills the typed `ritualItems` slot).
- Full **Hub-operator** role + tunable settings UI (separate epic, linked from #55).
- In-app notification **bell UI** (pre-existing deferred work).
- Agent-drafted broadcasts / digest copy (Slice F wires `agent_draft`).
