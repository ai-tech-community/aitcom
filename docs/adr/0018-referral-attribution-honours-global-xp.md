# Referral attribution honours one Hub-global XP

**Status:** accepted

Slice E (Acquire) lets a member refer others into a [[Community]] and rewards
the referrer. The reward is **Hub-global XP** — the same single currency every
other contribution feeds (ADR-0012) — and it is granted under three hard rules:

1. **Credit fires only on the referred member's [[activation]]**, never on
   signup or mere join. Activation is the Slice D milestone (a real
   contribution + a received response within the window). A throwaway account
   that joins and goes dark earns the referrer nothing.
2. **The referral XP amount is a fixed Hub constant** (`REFERRAL_ACTIVATED`),
   identical in every community. A community cannot set its own referral
   payout.
3. **The referral leaderboard is a *view*** — `count(*)` over the
   `referral_credit` ledger grouped by referrer — never a new persisted
   reputation score.

**Why:** ADR-0012 fixed one identity, one XP total, no community-local
currency, because a second ledger fragments cross-identification and opens a
farming surface. A naive referral reward re-opens exactly that surface, so each
rule closes a specific hole:

- **Credit-on-activation** denies the obvious farm: spin up N accounts, "refer"
  them, collect XP. An account only pays out if it does real, reciprocated work
  — at which point it has already earned its *own* XP honestly and the
  community genuinely gained an active member. The referrer's reward is aligned
  with the outcome the platform actually wants.
- **A fixed Hub-wide amount** denies a farming *differential*. If a community
  could set referral XP, a member could stand up a low-bar community paying a
  huge referral bounty and mint global XP through it. One constant everywhere
  removes the arbitrage, keeping XP a single honest currency.
- **Leaderboard-as-view** keeps the promise that there is no parallel
  reputation store. Referral counts are a lens on the ledger, computed on read,
  carrying no XP of their own — the same treatment ADR-0012 gives community
  leaderboards and activity rankings.

Attribution reuses what already exists: a member's referral link **is** a
`community_invite` they created, and redemption sets
`community_membership.invited_by = invite.created_by`. No new invite surface, no
new attribution column.

**Crediting is reconciled, not event-hooked.** Activation is a *derived* state
(`computeActivationStage` is pure and recomputed on read — there is no persisted
"activated" transition to hang a trigger on). So a periodic reconciliation
sweeps members who have an `invited_by`, no existing credit, and a current stage
of `activated`, and credits each referrer **exactly once** via a
`referral_credit` ledger row that is **unique on `referred_user_id`**
(`onConflictDoNothing`). The sweep is self-healing and idempotent: re-running it
credits nothing new, which suits the `drizzle-orm/neon-http` no-interactive-
transaction constraint (claim-by-insert, then award).

The rejected alternatives:

- **Credit on signup/join** — simplest, but the canonical farm; declined.
- **A dedicated `referral` table with its own state machine** — duplicates the
  `community_invite` + `invited_by` attribution that already works; declined for
  the reuse path, keeping only the thin `referral_credit` ledger as the
  exactly-once guard.
- **Per-community configurable referral XP** — gives admins a growth lever but
  re-introduces the farming differential ADR-0012 spent its whole argument
  closing; declined.
- **A per-referrer XP cap per window** — considered as defence-in-depth, but
  with credit already gated on genuine activation the cap guards little and adds
  tuning surface; declined for now (revisit if abuse appears).

**Consequences:**

- One new ledger table `referral_credit` (`app`), unique on `referred_user_id`;
  no `communityId` on any XP store (ADR-0012 still holds — XP is awarded
  `awardXp(db, referrerId, amount)`, user-scoped).
- Referral credit is **forward-looking**: only members whose `invited_by` is set
  *and* who reach `activated` after this ships are credited; no historical
  back-credit.
- The referrer is told via an in-app `notification` (`type =
  "referral_credited"`); the audit `activity_event` (`type =
  "referral.credited"`) leaves `recipient_id` **null**, deliberately staying off
  the overloaded `recipient_id` privacy filter (the Slice D lesson).
- If referral ever needs to reward something other than activation, or a
  community genuinely needs a local growth lever, that is a **new ADR** — do not
  quietly relax credit-on-activation or the fixed-amount rule.
- Revisit only if ADR-0012 (Hub-global reputation) is itself revisited, or if a
  concrete farming pattern survives the activation gate.
