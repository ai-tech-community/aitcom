# Slice E — Acquire (discovery → referral → public pages): Design

> Status: approved (2026-05-31). Next: `writing-plans` → `role:task` sub-issues under epic **#59**.

**Goal.** Grow each community by **converting warm Hub members first**, then **rewarding referrals**, then **drawing outsiders in via public pages** — without ever minting a second reputation currency (ADR-0012). Three sub-areas, one slice, internal ordering **discovery → referral → public pages**:

1. **Internal discovery + contextual cross-promotion** — surface the right *other* communities to a member, ranked by liveness (Slice A signals), on the existing `/communities` directory ("Recommended for you") and as a line in the existing weekly Hub digest.
2. **Referral** — a member's personal share link is a `community_invite` they created; attribution flows through the existing `community_membership.invitedBy`; the referrer earns **Hub-global XP only when the referred member *activates*** (Slice D milestone), reconciled idempotently.
3. **Public-page enrichment + intro suggestions** — enrich the already-public `/communities/[slug]` with a public-safe liveness preview, share/OG metadata, and a prominent join CTA; the advisory agent drafts **introduction suggestions** for new arrivals via the existing Slice F flow.

**Governing decisions:** `docs/adr/0012-reputation-stays-hub-global.md` (referral honours one global XP; leaderboard is a *view*, never a new ledger), `docs/adr/0013-hub-invariant-vs-community-policy.md` (cross-promotion opt-in is community policy), `docs/adr/0015-community-surfaces-are-human-authored.md` (agent drafts intros, humans publish), **new `docs/adr/0018-referral-attribution-honours-global-xp.md`**, `CONTEXT.md` (Introduction suggestion, Contribution action, Active member).

**GitHub:** Epic **#59** (Slice E). Tasks below become `role:task` sub-issues.

---

## Landscape (verified during planning)

Reuse, don't rebuild:
- **Public pages already exist.** `communities.list` / `getBySlug` / `getMembers` are `publicProcedure`s; the `/communities` directory lists communities where `isListedInDirectory = true`; `/communities/[slug]` renders a public profile + member roster. Sub-area 3 is **enrichment**, not greenfield.
- **Invite codes already exist.** `community_invite` (`code`, `createdBy`, `maxUses`, `useCount`, `expiresAt`) + `community_membership.invitedBy` (`schema.ts:2426`) + `invitedBy`-on-join. A member's referral link is just a `community_invite` they created; attribution is the existing `invitedBy`. No new invite surface.
- **Liveness signals (Slice A).** `HealthPulse` (`activeNow`, `contributionCount`/`contributionPrev` momentum, `newJoins`), `CONTRIBUTION_ACTIONS`, `windowStart` (`src/server/communities/insights.ts`, pure + tested). These rank discovery.
- **Activation milestone (Slice D).** `computeActivationStage` (`src/server/communities/activation.ts`, pure, **derived — no persisted transition**) decides when a referred member counts as `activated`. Referral credit reconciles against this.
- **XP is Hub-global, user-scoped.** `awardXp(db, userId, amount)` (`src/lib/gamification.ts:220`); `XP_AMOUNTS` constants. Referral XP is a **single Hub constant**, never per-community (ADR-0012 anti-farm).
- **Weekly digest.** `api/cron/hub-digest` + the `digest` opt-out category (ADR-0014). The discovery line rides the existing digest; no new opt-out plumbing.
- **Advisory always-draft (Slice F).** `agentDrafts` + `reviewDraft`, `introductions` table, `suggest-introduction` MCP tool. Intro suggestions on the acquire path reuse this end-to-end — **no new draft type**.
- **Per-community config pattern.** `community_engage_config`/`engageConfigRouter`, `community_activation_config`/`activationConfigRouter` (owner/admin `requireConfigAdmin`) — the exact template for `acquireConfigRouter`.
- **Roles.** `communityProcedure` injects `ctx.communityRole`; owner/admin gate config; owner/admin/moderator read dashboards.

Genuinely new (this slice):
- Discovery ranking pure logic + candidate/signal queries + `discoveryRouter`.
- The discovery line in the digest builder.
- `referral_credit` ledger + referral pure logic + reconciliation cron + `referralRouter` (my-link, leaderboard).
- Opening `community_invite` creation to ordinary members (personal links).
- Public-safe liveness preview query + share/OG metadata on `/communities/[slug]`.
- Acquire-path intro candidates query + MCP tool feeding the existing `suggest-introduction`.
- `community_acquire_config` + settings panel.

## Decisions locked (this brainstorm)
1. **Scope = all three sub-areas, one PR**, task groups separated by sub-area.
2. **Discovery ranking = liveness/health** (Slice A signals), excluding the member's existing communities, restricted to `isListedInDirectory = true`.
3. **Cross-promotion surface = the `/communities` directory ("Recommended for you") + one line in the existing weekly digest.** Digest line respects the existing `digest` opt-out.
4. **Referral mechanism = reuse `community_invite` + `invitedBy`.** A member's personal link is a `community_invite` they created; join sets `membership.invitedBy = invite.createdBy`.
5. **Referral credit = on activation, Hub-global XP to the referrer.** Reconciled (not event-hooked) because activation is derived; exactly-once via the `referral_credit` ledger.
6. **Anti-abuse guardrails:** block self-referral; **one credit per referred member** (idempotent); **credit only on activation** (never on mere signup/join). *No* per-referrer window cap (declined).
7. **Referral XP = a fixed Hub constant** `REFERRAL_ACTIVATED = 50` (matches `ONBOARDING_COMPLETE`), **not** per-community configurable (ADR-0012).
8. **Agent's acquire role = introduction suggestions only.** Discovery + digest line are deterministic (no agent). Intros reuse Slice F's `suggest-introduction` always-draft flow.
9. **Public-page enrichment = liveness preview (public-safe subset) + share/OG metadata + prominent join CTA.**
10. **Referral credit delivery:** in-app `notification` to the referrer (`type = "referral_credited"`) + a plain `activity_event` for audit; **`recipientId` left null** (avoids the overloaded privacy-filter from Slice D).

---

## Architecture (mirrors A/B/C/D: pure core + thin tRPC + thin cron/MCP + reuse)

1. **Pure cores** (vitest, injected clock, no DB):
   - `src/server/communities/discovery.ts` — `rankCommunitiesForMember(candidates, { now })` → liveness score + ordering; excludes already-member; deterministic.
   - `src/server/communities/referral.ts` — `decideReferralCredit({ referrerId, referredUserId, activationStage, alreadyCredited })` → `{ credit: boolean; reason }`; encodes the three guardrails.
2. **Schema** — 2 new `app` tables: `community_acquire_config`, `referral_credit`. (No table for discovery — it's a live view; none for public pages — enrichment of existing.)
3. **Thin tRPC** — `discoveryRouter` (`recommendedForMe`), `referralRouter` (`myLink`, `leaderboard`), `acquireConfigRouter` (`get`/`set`); extend `advisory` (`newJoinerIntroCandidates`).
4. **Thin cron** — `api/cron/referral-reconcile` (credit newly-activated referred members) + the discovery line added to `api/cron/hub-digest`.
5. **Thin MCP** — `new-joiner-intro-candidates` feeding the existing `suggest-introduction`.
6. **Public surface** — public-safe liveness preview query + OG/share metadata on `/communities/[slug]`; open `community_invite` create to members.

### File structure
- Create `src/server/communities/discovery.ts` (+ `.test.ts`) — ranking logic.
- Create `src/server/communities/discovery-queries.ts` — candidate communities + HealthPulse signals + member's memberships.
- Create `src/server/communities/referral.ts` (+ `.test.ts`) — credit-decision logic.
- Create `src/server/communities/referral-queries.ts` — referred-uncredited cohort, leaderboard view, personal-link upsert.
- Modify `src/server/db/schema.ts` — `community_acquire_config`, `referral_credit` tables + relations.
- Create `src/migrations/2026053x_acquire.ts` (+ register **last** in `index.ts`).
- Create routers `src/server/api/routers/discovery.ts`, `referral.ts`, `acquireConfig.ts`; register in `root.ts`.
- Modify `src/server/api/routers/advisory.ts` — `newJoinerIntroCandidates`.
- Modify the join/invite-redeem path — set `membership.invitedBy` from the redeemed invite's `createdBy`; allow members to create their own `community_invite`.
- Modify `src/app/api/cron/hub-digest/route.ts` — append the discovery line (per recipient, top-ranked listed community they're not in; gated by digest opt-out).
- Create `src/app/api/cron/referral-reconcile/route.ts` + register in `vercel.json`.
- Modify `src/app/api/mcp/advisory-tools.ts` — `new-joiner-intro-candidates` tool.
- Modify `src/server/api/routers/communities.ts` (or a new public query) — public-safe liveness preview for `getBySlug`.
- UI: "Recommended for you" rank on `/communities`; referral link + leaderboard panel; acquire-config settings panel; liveness preview + join CTA + OG metadata on `/communities/[slug]`; `messages/*.json`.

## Data model
- **`community_acquire_config`** (`app`): `communityId` pk → community, `crossPromote` bool default true (eligible to be recommended in the digest line), `referralsEnabled` bool default true, `updatedAt` timestamptz.
- **`referral_credit`** (`app`): `id` pk, `referrerId` → user, `referredUserId` → user **(unique)**, `communityId` → community, `xpAwarded` int, `creditedAt` timestamptz. The unique `referredUserId` is the exactly-once guard (`onConflictDoNothing`). Index `(referrerId)` for the leaderboard view.
- Reuse `community_invite` (`createdBy` = referrer) + `community_membership.invitedBy` (attribution); `activity_event` (`type = "referral.credited"`, audit, `recipientId` null); `notification` (`type = "referral_credited"`).

## Pure logic contracts
```
// discovery.ts
type CommunityCandidate = {
  communityId: string; slug: string; name: string;
  activeNow: number; contributionCount: number; contributionPrev: number; newJoins: number;
  isListed: boolean; crossPromote: boolean;
};
rankCommunitiesForMember(opts: {
  candidates: CommunityCandidate[];
  memberCommunityIds: Set<string>;   // exclude these
  now: Date;
}): RankedCommunity[]   // sorted by liveness score desc; only isListed; excludes memberCommunityIds

// referral.ts
decideReferralCredit(opts: {
  referrerId: string | null;          // membership.invitedBy
  referredUserId: string;
  activationStage: ActivationStage;   // from computeActivationStage
  alreadyCredited: boolean;           // referral_credit row exists
}): { credit: boolean; reason: "ok" | "no_referrer" | "self_referral" | "not_activated" | "already_credited" }
```
**Liveness score** = weighted blend of current active contributors + positive contribution momentum (`contributionCount − contributionPrev`) + recent joins, normalized; ties broken by `activeNow`. **Credit rules:** no `referrerId` → `no_referrer`; `referrerId === referredUserId` → `self_referral`; `alreadyCredited` → `already_credited`; `activationStage !== "activated"` → `not_activated`; else `credit: true`.

## Flows
**Discovery (`discoveryRouter.recommendedForMe`):** load listed candidate communities + their HealthPulse signals + the member's current memberships → `rankCommunitiesForMember` → top-N. Powers the directory's "Recommended for you". UI excludes communities already joined; join CTA respects `joinPolicy`.

**Digest line (`hub-digest` cron):** for each digest recipient not opted out of `digest`, pick the single top-ranked `crossPromote` community they're not in; render one "Discover: <community>" line. No new send-log (rides the existing digest idempotency).

**Referral link (`referralRouter.myLink`):** get-or-create the member's personal `community_invite` for a community (`createdBy = member`); return the shareable code/URL. Redeeming a code on join sets `membership.invitedBy = invite.createdBy` + increments `useCount` (CAS).

**Referral reconcile (`referral-reconcile` cron):** find members with `invitedBy` set, no `referral_credit` row, whose `computeActivationStage === "activated"` → `decideReferralCredit` → for each `credit:true`: insert `referral_credit` (`onConflictDoNothing`); if inserted, `awardXp(db, referrerId, REFERRAL_ACTIVATED)`, write the audit `activity_event` (recipientId null), and insert a `referral_credited` notification. Self-healing + idempotent.

**Referral leaderboard (`referralRouter.leaderboard`):** `count(*)` of `referral_credit` grouped by `referrerId` (Hub-global), hydrated with profiles. A *view*, not a reputation store (ADR-0012).

**Public-page enrichment:** `getBySlug` (or a sibling public query) returns a **public-safe** liveness subset — active-member count + recent *public* threads/events only (no admin/at-risk data). The page adds OG/share `<meta>` + a prominent join CTA. Intro suggestions: `advisory.newJoinerIntroCandidates` (joiners in last N days) → existing `suggest-introduction` → `intro_suggestion` draft → `reviewDraft`.

## ADR-0018 (new)
Referral attribution honours one Hub-global XP: credit fires **only on activation** (never signup), the referral XP is a **fixed Hub constant** (not per-community, to deny a farming differential), and the referral leaderboard is a **view over the credit ledger**, never a parallel reputation store. Crediting is **reconciled idempotently** (activation is derived, not a transition) via a `referral_credit` ledger unique on `referredUserId`. Builds on ADR-0012/0013/0015.

## Testing
- **Pure (vitest, injected clock):** `rankCommunitiesForMember` (ordering, exclusion of joined + unlisted, momentum tie-breaks, empty candidates); `decideReferralCredit` (each reason branch + the happy path).
- **Thin:** tRPC/cron/MCP wrappers; reuse the insights/advisory/digest test patterns. Reconcile-cron idempotency (second run credits nothing).
- Mirrors A/B/C/D: logic in pure cores, glue minimal.

## Task decomposition (→ `writing-plans` formalizes as `role:task` sub-issues under #59)
1. **Discovery pure logic** — `rankCommunitiesForMember` + score (vitest).
2. **Discovery queries + tRPC** — candidate/signal queries + `discoveryRouter.recommendedForMe`.
3. **"Recommended for you" UI** on `/communities` + digest discovery line in `hub-digest`.
4. **Acquire config** — `community_acquire_config` + migration + `acquireConfigRouter` + settings panel (`crossPromote`, `referralsEnabled`).
5. **Referral schema + link** — `referral_credit` table; open `community_invite` create to members; `membership.invitedBy` on redeem; `referralRouter.myLink`.
6. **Referral credit logic** — `decideReferralCredit` (vitest) + `REFERRAL_ACTIVATED` constant.
7. **Referral reconcile cron** — credit newly-activated referred members (idempotent) + notification + audit event.
8. **Referral leaderboard** — `referralRouter.leaderboard` (view) + UI panel.
9. **Public-page enrichment** — public-safe liveness preview query + OG/share metadata + join CTA on `/communities/[slug]`.
10. **Acquire intro suggestions** — `advisory.newJoinerIntroCandidates` + MCP tool feeding `suggest-introduction`.
11. **ADR-0018 + CONTEXT.md + integration verification.**

## Open calls (correctable at spec review)
- Acquire-config gated **owner/admin**; discovery read is **any member** (it's personalized to them); leaderboard is public/any-member.
- Referral XP (`REFERRAL_ACTIVATED = 50`) and the reconcile cadence (daily) are tuned constants, not admin toggles.
- Referral credit is **forward-looking** — only members who activate after this ships get credited (reconcile evaluates current `invitedBy` + activation; pre-existing activated members are not back-credited unless `invitedBy` was already set).
- The digest discovery line is **one community per recipient per digest**, gated by `crossPromote` + the existing `digest` opt-out.
- Public liveness preview exposes **only** active-member count + recent public threads/events — never at-risk/insight data.
