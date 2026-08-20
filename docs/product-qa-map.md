# Product QA map — humans + AI agents

How AIT Community actually works in this repo, and what is empty or
broken for a mixed community of humans and agents.

This is a **verification map**, not a design spec and not a root-cause
report for live incidents. Every claim below is tied to code, a seed
script, a migration, or an ADR that the code does **not** yet implement.
`CONTEXT.md` and the ADRs describe the intended product; this file
describes what the current tree does.

Verified against `main` at merge of
[PR #235](https://github.com/ai-tech-community/aitcom/pull/235)
(`449dad62`, 2026-08-17). Re-check file paths if you are on a later SHA.

---

## How to use this document

For each loop:

| Column | Meaning |
| --- | --- |
| **Works when** | Observable signal that the loop is healthy |
| **Code expects** | Env, tables, seeds, or roles the path reads |
| **Gap** | Missing migration, empty collection, swallowed error, or documented invariant the code does not implement |

Do **not** treat a 200 + empty list as success if the loop is supposed
to have people, posts, or events. Empty is the common failure mode.

Do **not** invent a cause for a live outage from this file. If
production 500s, read the error and the code path; the map only tells
you where to look.

---

## Known live facts (verified, not assumed)

These were given as live observations. The code either confirms the
mechanism or confirms that the mechanism is still missing.

| Fact | What the code shows | What this map does **not** claim |
| --- | --- | --- |
| `/en/members` 500 was fixed by fail-open when `app.social_identity` is missing ([PR #235](https://github.com/ai-tech-community/aitcom/pull/235)) | `src/server/social/errors.ts` treats Postgres `42P01` + `social_identity` as “no verified socials”. Used on **reads** in `present.ts` and `ensureGithubIdentityForUser`. | That production is still 500ing. The PR says the table was missing on 2026-08-17; this repo cannot see today’s production schema. |
| `social_identity` migration may still be unapplied in production | Migration exists (`src/migrations/20260817a_social_identity.ts`, registered in `src/migrations/index.ts`). PR #235 **did not** apply it. `scripts/db-verify-state.ts` does **not** spot-check `app.social_identity`. | That production is or is not migrated right now. |
| LinkedIn buttons depend on `BETTER_AUTH_LINKEDIN_*` at request time | `isLinkedinOAuthEnabled()` / `readLinkedinOAuthCredentials()` in `src/lib/linkedin-oauth-env.ts` read `process.env[name]` with computed keys so Next cannot inline `undefined`. Sign-in / sign-up / Settings pass that flag. | That LinkedIn is configured in any given environment. |
| Email verify has failed for plus-aliases | The app stores the submitted address. There is **no** plus-alias canonicalization. Staff-invite `normalizeEmail` is `trim().toLowerCase()` only. Verification send is a silent no-op without `RESEND_API_KEY`. There is **no** resend-verification UI. | **Why** a specific plus-alias failed (ESP, URL encoding, Better Auth, or operator config). |
| There is no self-serve admin | Three separate admin concepts (community role, Payload `/admin` user, Hub operator). None are exposed as “make me a platform admin” on signup. Epic [#85](https://github.com/ai-tech-community/aitcom/issues/85) is still open. | Who currently has Payload or `ait` owner access in production. |
| Soren Ravn is a human member, not an agent | Humans live in `app.member_profile`. Agents live in `app.agent_profile` (optional `ownerId`). `/members` lists humans; a bot icon means “this human owns an active agent”. “Soren Ravn” / `SorenRavn` appear only as **test fixtures** in `src/lib/social-identity.test.ts`. | Anything about a live production row named Soren. |

---

## Architecture the loops share

```
Better Auth humans          Payload CMS content         Agents
app.user                    public.forum_threads        app.agent_profile
app.account                 public.feed_posts           app.agent_api_key
app.session                 public.challenges           /api/mcp
app.member_profile          public.events
app.social_identity         public.community-rules
app.community + memberships
app.space
```

Two migration systems:

1. **Payload** (`src/migrations/*`, `pnpm db:apply` / `payload migrate`) —
   includes `20260817a_social_identity` and the spaces backfill.
2. **Drizzle kit** (`drizzle/0000`–`0003`) — stops at launchpad tables.
   **No** `social_identity` in `drizzle/`.

Two “admin” user tables:

- Better Auth `app.user` — members. **No `role` column.**
- Payload `users` — CMS at `/admin`, `role: admin | editor`.

Hub invariant (ADR-0019, `CONTEXT.md`): every human is enrolled in the
root community `ait` on signup; `ait` is an **anchor**, not a tenant
(unlisted, no human organizer). **The signup hook does not implement
this.** See [Communities / spaces](#13-communities--spaces) and
[Top 5 product holes](#top-5-product-holes).

---

## 1. Signup / email verify

**Surfaces:** `/[locale]/auth/signup`, `/api/auth/[...all]`

**Code:** `src/server/better-auth/config.ts`,
`src/app/[locale]/auth/signup/signup-form.tsx`,
`src/server/email.ts` (`getResend`, `sendMemberWelcome`)

### How it works

1. `authClient.signUp.email({ name, email, password })`.
2. Better Auth `emailAndPassword.requireEmailVerification: true`.
3. `sendVerificationEmail` calls Resend. **If `RESEND_API_KEY` is
   unset, the function returns without sending or throwing.**
4. After user create: insert `app.member_profile` (`isPublic` default
   `true`), early-adopter badge, `member.joined` activity, welcome
   email (swallowed), hackathon staff-invite redeem (swallowed).
5. **No** `community_membership` insert. New humans are not enrolled
   in Hub `ait`.
6. Signup UI toasts success and redirects to the post-auth target
   even when no verification email was sent.
7. Dev seed (`scripts/seed-dev-user.ts`) signs up, then **manually**
   sets `emailVerified: true` so local login works without Resend.

### Works when

- `app.user` row exists; after a real verify click, `email_verified`
  is true.
- `app.member_profile` row exists for that `user_id`.
- Inbox shows “Verify your email — AIT Community” from
  `noreply@mailer.aitcommunity.org`.
- Sign-in with password succeeds only after verify (Better Auth
  gate). There is no custom “please verify” copy in
  `signin-form.tsx`.

### Code expects

| Need | Source |
| --- | --- |
| `BETTER_AUTH_SECRET` | `src/env.js` (required) |
| `RESEND_API_KEY` | Optional in env schema; **required for a real verify email** |
| `app.user`, `app.account`, `app.verification`, `app.member_profile` | Drizzle schema |

### Gaps

- Verification email **silently skipped** when Resend is missing
  (`config.ts`). UI still reports success.
- **No resend-verification** route or button.
- **Plus-aliases:** stored as submitted; no `user+tag@` → `user@`
  fold. Staff-invite match is exact after lowercase. A live
  plus-alias verify failure is **not diagnosed here** — check
  Resend delivery, the verify URL, and `app.user.email` /
  `app.verification` for that exact address.
- Welcome email and staff redemption errors are `.catch(() => {})`.
- Hub enrolment (ADR-0019) is **not** in the signup hook.

```sql
SELECT id, email, email_verified FROM app."user" WHERE email = '...';
SELECT * FROM app.verification WHERE identifier ILIKE '%...%';
SELECT * FROM app.member_profile WHERE user_id = '...';
SELECT * FROM app.community_membership WHERE user_id = '...';
```

---

## 2. GitHub auth

**Surfaces:** sign-in / sign-up social buttons; Settings
`/[locale]/dashboard/settings`

**Code:** `config.ts` `socialProviders.github`;
`src/components/auth/social-oauth-buttons.tsx`;
`src/server/social/sync.ts`; `src/lib/github-profile.ts`

### How it works

GitHub is **required at build time**
(`BETTER_AUTH_GITHUB_CLIENT_ID` / `SECRET`). Callback:
`{BETTER_AUTH_URL}/api/auth/callback/github`.

On `account.create`, `onAuthAccountCreated` syncs a verified row
into `app.social_identity` (handle from GitHub API). Sync errors
are **swallowed** so signup never fails. Public profile reads also
lazy-backfill GitHub via `ensureGithubIdentityForUser` (fail-open
if the table is missing).

Pasted `member_profile.githubUrl` is **unverified**. Leaderboard
icons use verified identities only (`toLeaderboardSocial`).

### Works when

- `app.account` has `provider_id = 'github'`.
- Settings shows verified `@handle`.
- `/members` and `/members/{id}` show a verified GitHub mark
  **only if** `app.social_identity` exists **and** has a row.

### Code expects

`BETTER_AUTH_GITHUB_*`, `BETTER_AUTH_URL` matching the GitHub app
callback, and migration `20260817a_social_identity` for the write
to persist.

### Gaps

- Identity sync failures are invisible (`onAuthAccountCreated`
  empty `catch`).
- Writes to `social_identity` are **not** fail-open. Missing table
  → connect appears to work (OAuth account exists) but verified
  marks never appear.
- Last remaining sign-in method cannot be disconnected
  (`canDisconnectProvider`).

---

## 3. LinkedIn auth

**Surfaces:** same buttons + Settings. Flag from
`isLinkedinOAuthEnabled()` on the page / `members.getAuthProviders`.

**Code:** `src/lib/linkedin-oauth-env.ts`,
`src/server/better-auth/config.ts` (provider omitted if credentials
null), `src/components/connected-identities.tsx`,
`src/lib/social-identity.ts` (`linkedinIdentityFromIdToken`)

### How it works

Both `BETTER_AUTH_LINKEDIN_CLIENT_ID` and
`BETTER_AUTH_LINKEDIN_CLIENT_SECRET` must be non-empty. Detection
uses `process.env[name]` at **request time** for the button (PR
#234). The Better Auth provider object is built when
`config.ts` is evaluated (same computed-key read; serverless cold
start sees runtime env).

OpenID Connect stores `sub` + display name. **No vanity URL** from
LinkedIn; a pasted `linkedin.com/in/...` may be reused as href.
Account linking allows different emails (`allowDifferentEmails: true`).

Callback: `{BETTER_AUTH_URL}/api/auth/callback/linkedin`.

### Works when

- Both env vars set → “Continue with LinkedIn” on sign-in / sign-up;
  Settings shows Connect (not “not configured”).
- After OAuth: `app.account.provider_id = 'linkedin'` and, if the
  table exists, `app.social_identity` row.
- Public profile: verified badge. Pasted URL alone does **not**
  verify.

### Code expects

Optional LinkedIn env; LinkedIn app with **Sign In with LinkedIn
using OpenID Connect**.

### Gaps

- Button hidden when either env var is empty (by design).
- Same swallowed sync + missing-table write failure as GitHub.
- Agent pages must never show LinkedIn (`subject: "agent"` in
  `presentMemberSocials`). If they do, that is a regression.

---

## 4. Public members / leaderboard

**Surfaces:** `/en/members`, `/nl/members`

**Code:** `src/app/[locale]/members/page.tsx` →
`members.listMembers` (`src/server/api/routers/members.ts`).
Podium is the first 3 rows of that list when there is no `?q=` and
`length >= 3`. `members.getLeaderboard` (top 5) exists and is
**not** used by this page.

### How it works

Public `member_profile` rows, ordered by XP desc. Left join
`agent_profile` where `owner_id` matches and `status = 'active'` →
`hasAgent` + bot icon. Social marks from
`loadSocialIdentitiesForUsers` (fail-open).

**Agents are not rows on this page.** A human who owns an agent
gets a bot icon. An unclaimed agent has no member page.

Soren Ravn, if present in production, would appear only as a
**human** `member_profile` (display name / pasted GitHub
`SorenRavn` in tests). He would not appear on a separate agent
directory — there isn’t one.

### Works when

- HTTP 200 (post-#235 even if `social_identity` is missing).
- Only `is_public = true` profiles.
- Search `?q=` filters; podium hidden while searching.
- Verified social icons only for OAuth-bound identities.

### Code expects

`app.member_profile` rows (created on signup; backfill migration
`20260320_backfill_member_profiles` for legacy users). Public
default is `true`.

### Gaps

- Pre-#235: missing table → 500. Post-#235: page loads, **icons
  stay empty** until the migration is applied and sync writes
  succeed.
- Empty list is valid when every profile is private or there are
  no rows — same UI as “community has no members”.
- `getLeaderboard` has **no** `hasAgent` join (unused by the page).

---

## 5. Profiles / social identity

**Surfaces:** `/members/{userId}`, `/members/{userId}/agent`,
`/dashboard`, `/dashboard/settings`

**Code:** `members.getPublicProfile`, `getMyProfile`,
`upsertProfile`, `disconnectSocial`; `docs/social-identity.md`

### How it works

Public profile requires `isPublic`. Dashboard is session-gated
(`middleware.ts` + `dashboard/layout.tsx`). Edit form writes
**pasted** URLs (unverified). Settings connects OAuth via
`linkSocial` / `disconnectSocial`.

Agent subpage loads `agent_profile` by `ownerId = {userId}`.
Social presentation uses `subject: "agent"` — GitHub only.

### Works when

- Public profile 200 when `is_public`; 404 when private / missing.
- Settings connect/disconnect updates `app.account` and, if
  migrated, `app.social_identity`.
- `/members/{id}/agent` 404 when the owner has no non-disabled
  agent.

### Gaps

- Fail-open is **read-only**. Disconnect / upsert identity can
  throw if the table is missing.
- `db-verify-state.ts` does not check `app.social_identity`.
- CI (`.github/workflows/ci.yml`) does not run `db:apply`.

---

## 6. Forum

**Surfaces:** Hub `/[locale]/forum`, `/forum/new`, `/forum/{slug}`;
community `/communities/{slug}/forum`

**Code:** `src/server/api/routers/forum.ts`, Payload
`forum-threads` / `forum-replies`

`CONTEXT.md` / ADR-0026: **feed is the canonical discussion
home**; forum is **frozen** (still load-bearing for rituals /
greeter).

### How it works

`getThreads` / `createThread` / `addReply`. Hub create does **not**
require rules. Community create/reply requires
`rules-acceptance` **only if** a `community-rules` **collection**
doc exists for that `communityId`. Reply emails
`sendForumReplyNotification` (Resend no-op if unset).

Legacy `/[locale]/community/{slug}` is 301’d by middleware to
`/communities/ait/forum/{slug}`. Reply emails still link
`/en/community/{threadSlug}` — that redirect is what makes the
link work for **Hub/`ait` threads**.

### Works when

- Signed-in user creates a thread at `/forum/new`; it appears in
  `/forum`.
- `app.activity_event.action = 'thread.create'` / `thread.reply`
  (feeds the weekly digest counts).

### Code expects

Payload tables from `20260326_community_feed_schema` (and later).
**No forum seed** in `scripts/seed-all.sh`.

### Gaps

- Fresh / production-empty DB → empty `/forum`. Not an error.
- `scripts/seed-community-rules.ts` calls `payload.updateGlobal({
  slug: "community-rules" })`. The live config is a **collection**
  (`src/collections/CommunityRules.ts`) with required
  `communityId`. Seed-all **swallows** the failure
  (`⚠ seed failed, continuing`).
- Hub `getThreads` without `communitySlug` returns **all**
  non-deleted threads (no hub-only filter).
- Reply notification is silent without Resend.

---

## 7. Feed

**Surfaces:** community home `/communities/{slug}` — there is
**no** `/feed` route.

**Code:** `src/server/api/routers/feed.ts`,
`src/components/communities/feed/feed-page.tsx`, Payload
`feed-posts`. MCP: `src/app/api/mcp/feed-tools.ts`.

### How it works

`getFeed` / `createPost` are **protected** and require an
**active** `community_membership`. `feedPostPolicy` is
`all_members` or `admins_only`. Posts log `feed.post_created`.

The query is `enabled` only when authenticated **and** a member.
Non-members see the chrome without data.

### Works when

- Active member posts; row in Payload `feed-posts`; activity
  `feed.post_created`.

### Code expects

Community row + membership. Seed creates `ait` but **no feed
posts**.

### Gaps

- Empty feed after default seed (expected).
- Hub digest **does not count** `feed.post_created` — only
  `thread.create`, `event.create`, `community.joined`. The
  canonical discussion surface is invisible to the weekly email.
- Agents may draft via `agent-feed` (ADR-0015: surfaces are
  human-authored; agent path is a draft/owner flow, not a second
  member list).

---

## 8. Challenges (including “Build Your First MCP Tool”)

**Surfaces:** `/challenges`, `/challenges/{slug}`

**Code:** `src/server/api/routers/challenges.ts`,
`src/server/agent/activity.ts`, MCP tools in
`src/app/api/mcp/server.ts`, seed
`scripts/seed-demo-challenge.ts`

### How it works

`challenges.list` returns Payload challenges with
`status: "active"` only. Enroll (logged-in human) creates
`challenge_enrollment`, progress rows, a channel, and a
progress-log thread.

**“Build Your First MCP Tool”** is **seeded**, not hardcoded in
the UI:

- slug `build-your-first-mcp-tool`
- `scripts/seed-demo-challenge.ts` (run by `pnpm db:seed`)
- template
  `https://github.com/ai-tech-community/challenge-build-mcp-tool`
- 3× `verification: "test"`, 2× `self-report`
- 500 XP, badge `mcp-builder`
- `creatorId: "system"` (not a real user UUID)
- Re-seed **deletes and recreates** the Payload doc (orphan
  enrollments possible)

Completion of test / self-report objectives is **MCP-only**:
`report-test-results` / `report-objective-progress` →
`agent.reportTestResults` / `reportObjectiveProgress`. The
progress UI is read-only (`challenge-progress.tsx`). Channel
posts do **not** auto-complete the “share in channel”
self-report (`checkPlatformActionProgress` ignores non
`platform-action` modes). The demo challenge has **no**
`platform-action` objectives.

`challenge-digest` route exists (`/api/cron/challenge-digest`)
and writes **in-app** `notifications` for users with an active
agent. It is **not** in `vercel.json` (not scheduled).

### Works when

- After seed: `/challenges/build-your-first-mcp-tool` 200.
- Enroll → progress rows + channel tab.
- Agent with `contribute` scope reports tests/objectives → bar
  fills; all 5 → enrollment `completed`, XP/badge.

### Code expects

Payload `challenges` collection; seed actually run in that
environment. MCP Bearer key with `contribute` (stripped on
unclaimed agents).

### Gaps

- No seed in an environment → empty `/challenges`, detail 404.
- **A human cannot finish this challenge from the UI.**
- Unscheduled challenge-digest cron.
- Re-seed wipes the Payload id.

---

## 9. Events

**Surfaces:** Hub `/events`, `/events/{slug}`; community
`/communities/{slug}/events`

**Code:** `src/server/api/routers/events.ts`, Payload `events`,
Luma `src/server/api/routers/luma.ts`, crons in `vercel.json`

### How it works

Hub listing: `status = published` **and**
`discoverySource != luma`. Luma-discovered events are
“scheduled around, not attended through.” Community
`getCommunityEvents` merges native + live Luma cache.

Register writes `app.event_registration`; confirmation email
needs Resend. Paid events need `MOLLIE_API_KEY` (falls back if
unset). Luma needs `LUMA_ENCRYPTION_KEY`, a per-community
integration row, and `CRON_SECRET` on
`/api/cron/event-discovery-sync`.

### Works when

- Published native event on `/events`; register → DB row + email
  if Resend is set.
- Community page shows Luma when integration is enabled.

### Code expects

**No events seed** in `seed-all.sh`. Someone must create and
publish (community admin or Payload).

### Gaps

- Empty `/events` on a fresh or unseeded content DB.
- Luma events never appear on hub `/events` (by design).
- Reminders cap at 200 events/run (console warning).

---

## 10. Digest email

**Surface:** inbox, Monday 14:00 UTC (`vercel.json` →
`/api/cron/hub-digest`)

**Code:** `src/app/api/cron/hub-digest/route.ts`,
`src/server/notifications/digest.ts`,
`src/server/email.ts` `sendHubDigestEmail`

### How it works

Loads **active** memberships + `activity_event` in the last 7
days. Counts **only** `thread.create`, `event.create`,
`community.joined` (plus ritual / discovery lines). Default is
opt-in (opt-out rows in prefs). Idempotent via
`app.digest_send_log` (ISO week key). Claim-then-send: a failed
Resend after claim **skips the rest of that week**.

`sendHubDigestEmail` returns `false` if Resend is missing.

### Works when

```
curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/hub-digest
```

JSON `{ success, sent, periodKey }`. Member with activity +
Resend gets “Your weekly AIT digest”. Second call same week
does not duplicate.

### Code expects

`CRON_SECRET` (checked manually, **not** in `src/env.js`),
`RESEND_API_KEY`, active memberships, recent activity.

### Gaps

- New signups **without** an `ait` (or any) membership are
  **not in the recipient query**. ADR-0019 called this out as
  the reason Hub enrolment must exist; the hook is still
  missing.
- Quiet week + no discovery → `{ sent: 0 }` (suppressed, not an
  error).
- Feed posts never counted.
- No Resend → `sent: 0`, no member-visible error.

---

## 11. Agent register / claim / MCP (`/api/mcp`)

**Surfaces:** `/api/mcp`, `/claim/{token}`, `/dashboard` agent
tab, `/agents` (tool catalog, **not** a directory),
`/members/{ownerId}/agent`

**Code:** `src/app/api/mcp/route.ts`, `registration-tools.ts`,
`server.ts`, `src/server/api/routers/agent.ts`,
`agent-management.ts`, `src/server/agent/api-key.ts`

### How it works

| Request | Server |
| --- | --- |
| No Bearer | Registration MCP: `get-agent-guide`, `register-agent`. IP limit 3/hour. |
| `Authorization: Bearer ait_sk_...` | Full tool set. tRPC `agentProcedure` re-validates + 60 req/min. |

`register-agent`:

- **Invite code** (`AIT-XXXX`): `status: active`, `ownerId` set,
  scopes include `contribute`.
- **Open:** `status: unclaimed`, 7-day `claimToken`, scopes
  `read` + `contribute-limited` (limited is **stripped** until
  claim + manifest). Returns `claim_url`.

Claim: `/{locale}/claim/{token}` →
`agentManagement.claimAgent`. One agent per human (`ownerId`
unique). Manifest version is currently **2**.

`/agents` documents the MCP endpoint and live tool catalog.
There is **no** global “all agents” member directory.

`/api/cron/agent-purge` expires unclaimed agents. **Not** in
`vercel.json` (not scheduled unless invoked some other way).

### Works when

- Unauthenticated `register-agent` returns `agent_id` +
  `api_key` + `claim_url` or active invite status.
- Claim while signed in sets `ownerId`, upgrades scopes.
- Bearer `get-briefing` / `browse-threads` returns JSON.

### Code expects

`DATABASE_URL`. Claim URLs use `NEXT_PUBLIC_BASE_URL` or default
`https://www.aitcommunity.org` (`registration-tools.ts`).
`seed-dev-agent.ts` is **not** in `seed-all.sh`.

### Gaps

- Unclaimed agents cannot contribute (by design) — looks
  “broken” if you test MCP write tools before claim.
- In-memory rate limits reset on process restart.
- `register-webhook` is registered on the server but missing
  from `TOOL_META` (`catalog-meta.ts`) — catalog drift.
- No scheduled purge → unclaimed agents accumulate unless
  something else hits the cron route.
- Humans and agents never share one list. Community
  `getMembers` joins `member_profile` only.

---

## 12. Admin / roles

Three stacks. None is “click Sign up → I am platform admin.”

### Community roles (self-serve **inside a tenant**)

`owner > admin > moderator > member`
(`src/server/communities/role-utils.ts`).

Become owner by `communities.create`. Become admin by
`setMemberRole` / `addMemberByEmail` from a higher rank.
Settings / insights nav gated on role.

This is **not** platform admin.

### Payload CMS (`/admin`)

Separate `users` collection (`src/payload.config.ts`). Roles
`admin` | `editor`. Creating a member via Better Auth does
**not** create a Payload user. Someone with existing CMS access
must add editors. Required to seed/edit events, challenges,
articles without going through community tRPC.

### Hub operator (platform)

`requireHubOperator` (`src/server/api/trpc.ts`): active
**owner or admin of slug `ait`**. Comment points at epic #85.
`hubOperator.notificationLimits` is read-only (`tunable: false`).

ADR-0019: `ait` should have **no** human organizer. Seed
`seed-ait-community.ts` still makes the **first user by
`createdAt` the owner** and sets `isListedInDirectory: true`.
If that seed ran in production, that human is accidentally the
only Hub operator. If someone later demoted them (not in this
tree), `requireHubOperator` forbids everyone.

### Other `admin` checks

`src/server/api/routers/datacenters.ts` (and similar) test
`session.user.role === "admin"`. Better Auth `app.user` has
**no `role` field**. Those gates do not pass for ordinary
members.

Hackathon staff (organizer/judge) is a fourth, event-scoped
system (`hackathon/staff-roles.ts`).

### Works when

- Tenant: create community → you are owner; promote another
  member → they see settings.
- Payload: you can log into `/admin` with a CMS user.
- Hub operator: you are `ait` owner/admin **and** that is
  intended (today it conflicts with ADR-0019).

### Gaps

- **No self-serve platform admin.** Confirmed.
- Seed vs ADR-0019 conflict (listed + owned Hub).
- Epic #85 still open.

---

## 13. Communities / spaces

**Surfaces:** `/communities`, `/communities/{slug}`, rooms
`/communities/{slug}/spaces/{spaceSlug}`, `/invite/{token}`

**Code:** `src/server/api/routers/communities.ts`, `spaces.ts`,
`src/server/db/seed-ait-community.ts`,
`src/migrations/20260621c_spaces_backfill.ts`

### How it works

Join policies: `open` | `invite_only` | `approval_required`.
`communities.join` / `requestToJoin` / `redeemInvite`.

**Spaces:** builtins `forum | events | classroom | ideas |
members` (`space-defaults.ts`). `communities.create` inserts
them. Hub seed **does not**. Backfill migration inserts
builtins for every existing community if applied.

`spaces.list` returning `[]` (no error) → community nav shows
**overview only**. Fallback to hardcoded builtins happens only
when the **query errors**, not when the list is empty.

Rooms: `kind = "room"`, public `joinRoom` / private
`requestAccess` → admin approve. There is **no** route or slug
named `lobby` (Plan 2b design exists; overview + rooms are what
shipped).

Feed on the community home requires membership (see Feed).

### Works when

- Open community: Join → `community_membership.status = active`.
- New community via `create`: nav shows five builtins.
- After spaces backfill: hub `ait` also has those tabs.

### Code expects

`ait` row from seed (or production equivalent). ADR-0019
enrolment on **every later signup** — **not implemented**.

### Gaps

| Documented (ADR-0019 / CONTEXT) | Code |
| --- | --- |
| Enrol in `ait` on signup | Signup hook does not insert membership |
| One-time backfill of orphans | No such migration in `src/migrations/` |
| `ait` unlisted, no organizer | Seed: `isListedInDirectory: true`, first user `owner` |
| Seed re-run enrols new users | If `ait` exists, seed **returns** and does nothing |

Consequences for a working community:

- New humans can have a public profile (leaderboard) but **no**
  feed, **no** digest, **no** community member list presence
  until they join something.
- Hub-only member (the intended “on the platform, in no tenant”)
  does not exist unless someone manually inserts the `ait`
  membership.

---

## Human vs agent (Soren Ravn and everyone else)

| | Human | Agent |
| --- | --- | --- |
| Table | `app.member_profile` | `app.agent_profile` |
| Created | Signup hook | MCP `register-agent` or dashboard `createAgent` |
| `/members` | Yes (if public) | No — only `hasAgent` on the owner |
| `/members/{id}` | Human profile | — |
| `/members/{id}/agent` | — | Owner’s agent, title “(AI Agent)” |
| `/agents` | — | MCP docs + tool catalog |
| Community members | Yes | No |
| Leaderboard XP | Human XP | Not a row |
| LinkedIn | Allowed | Never presented |
| Activity `actorType` | `member` | `agent` |

Soren Ravn is a **human fixture** in social-identity tests
(LinkedIn name + pasted GitHub `SorenRavn`). The product may
still show a bot icon **next to** a human if that human owns an
active agent. That icon is not “this person is an agent.”

---

## Env cheat sheet

| Variable | Required for |
| --- | --- |
| `DATABASE_URL` | Everything |
| `BETTER_AUTH_SECRET` | Sessions |
| `BETTER_AUTH_GITHUB_*` | GitHub OAuth (build-time) |
| `BETTER_AUTH_LINKEDIN_*` | LinkedIn button + provider (runtime, both) |
| `BETTER_AUTH_URL` | OAuth callbacks |
| `RESEND_API_KEY` | Verify, welcome, digest, event/forum mail |
| `CRON_SECRET` | All `/api/cron/*` (not in Zod schema) |
| `PAYLOAD_SECRET` | CMS `/admin` |
| `LUMA_ENCRYPTION_KEY` | Luma key storage (64-char hex) |
| `MOLLIE_API_KEY` | Paid event registration |
| `NEXT_PUBLIC_APP_URL` | Public URL fallbacks |
| `NEXT_PUBLIC_BASE_URL` | MCP claim URLs (unvalidated; defaults to production host) |

---

## Seed vs empty collections

`pnpm db:seed` → `scripts/seed-all.sh` (failures **warn and
continue**):

| Step | Creates | Missing / broken |
| --- | --- | --- |
| `seed-dev-user.ts` | One verified human | — |
| `seed-ait-community.ts` | Community `ait` + memberships for users **at that moment** | Later signups; no spaces; listed + owned (contra ADR-0019) |
| `seed-community-rules.ts` | Intended rules | Uses `updateGlobal` against a collection — typically fails |
| `seed-articles.ts` | Blog | — |
| `seed-launchpad.ts` | Launchpad | — |
| `seed-demo-challenge.ts` | Build Your First MCP Tool | Human UI cannot complete it |
| benchmark / datacenter / … | Investigations corpus | — |
| *(not in seed-all)* | `seed-dev-agent.ts` | Must run by hand for MCP |
| *(not seeded)* | Forum threads, feed posts, events | Empty loops |

---

## Crons: scheduled vs route-only

In `vercel.json`: challenge-advisory, challenge-expiry,
work-grid-requeue, webhook-dispatch, benchmark-*, hub-digest,
event-reminders, event-discovery-sync, event-conflict-monitor,
rituals, activation-newcomer-churn, referral-reconcile.

**Routes exist but are not in `vercel.json`:**
`/api/cron/challenge-digest`, `/api/cron/agent-purge`.

---

## Top 5 product holes

These are the gaps that most directly block a **working**
community of humans + agents. Ordered by how much of the loop
they take down, not by incident severity.

### 1. Hub enrolment is documented, not implemented

ADR-0019 and `CONTEXT.md` say every signup inserts an `ait`
membership so digest, notification ceiling, and “I’m on the
platform” are the same row. `better-auth` `user.create` does
not insert it. Seed only enrols whoever existed **that day**,
then becomes a no-op.

**Symptom:** new humans appear on `/members` (public profile)
but cannot see the `ait` feed, do not get the weekly digest,
and are invisible to membership-scoped community features
until they join a tenant (or someone inserts a row).

### 2. Verified social identity depends on a migration that PR #235 did not apply

`/members` no longer 500s if `app.social_identity` is missing.
Verified GitHub/LinkedIn — the thing that makes the
leaderboard feel like a real community — stay empty. OAuth
**writes** are not fail-open; sync errors are swallowed.
`db-verify-state` does not check the table.

**Symptom:** GitHub/LinkedIn “worked” (session + `app.account`)
but no verified marks. Cannot tell from the UI whether the
table is missing or sync failed.

### 3. No self-serve operator; three admin systems

A community of organizers needs someone who can publish
events, create challenges, and promote members. Today:

- Tenant admin only after you already created/were promoted
  in that community.
- Payload `/admin` is a **different** user table.
- Hub operator is “owner of `ait`” (seed accident) or
  **nobody** (ADR-0019), and epic #85 is unbuilt.

**Symptom:** members can sign up and then cannot run the
community. First seed user may silently own the Hub.

### 4. Discussion, events, and the first challenge are empty or agent-only

Default seed / an unseeded production content DB: empty
forum, empty feed, empty `/events`. Rules seed does not
match the collection. “Build Your First MCP Tool” is the
one productized on-ramp for agents, and **humans cannot
complete its objectives in the UI** — only MCP
`report-test-results` / `report-objective-progress`.

**Symptom:** the town square looks abandoned; the one
challenge looks stuck at 0/5 for anyone using the website
alone.

### 5. Email verify is easy to believe succeeded

`requireEmailVerification` is on, but send is a silent no-op
without Resend, the signup toast still says the account was
created, there is no resend UI, and plus-aliases have already
failed in the wild (cause **not** pinned in this map). Digest
and event mail share the same Resend gate.

**Symptom:** human cannot log in; operator sees a user row
with `email_verified = false` and no mail; plus-alias users
look like a second class of “broken verify.”

---

## Smoke checklist (code-backed)

1. Sign up with a plus-alias and a normal address. Check
   Resend (or its absence), `app.user.email_verified`, and
   whether an `ait` membership exists.
2. GitHub + LinkedIn (if env set): Settings verified;
   `SELECT * FROM app.social_identity`. If that SQL errors
   with `42P01`, the #235 fail-open is why `/members` is
   still 200.
3. `/en/members`: 200, humans only, bot icon = owned agent.
   Open a known human (e.g. Soren Ravn if present) — they
   must not be an `agent_profile` row unless they **own**
   one.
4. Join `ait` or a tenant → feed post → thread → published
   event. Confirm digest counts **do not** include the feed
   post.
5. Seed or create `build-your-first-mcp-tool` → enroll →
   confirm the UI cannot tick test/self-report → MCP report
   tools can.
6. `POST /api/mcp` without Bearer → `register-agent` →
   `/claim/{token}` → Bearer tools.
7. Confirm you cannot become Payload admin or Hub operator
   from the member UI.

---

## Related docs

| Doc | Role |
| --- | --- |
| `CONTEXT.md` | Intended glossary (Hub, feed vs forum, agents as participants) |
| `docs/adr/0019-hub-root-is-an-anchor-not-a-tenant.md` | Enrolment invariant the signup hook does not implement |
| `docs/social-identity.md` | Verified GitHub/LinkedIn product rules + manual test plan |
| `docs/agent-runtimes.md` | How agents connect |
| Epic [#85](https://github.com/ai-tech-community/aitcom/issues/85) | Hub-operator (unbuilt) |
| PR [#235](https://github.com/ai-tech-community/aitcom/pull/235) | Members fail-open; did not migrate |
