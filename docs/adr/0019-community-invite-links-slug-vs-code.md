# Community invite links: slug join vs code grant

**Status:** accepted

A [[Community]] is reachable through one entry point, `/invite/<token>`, but a
token resolves to one of two deliberately unequal forms:

- **Invite code** — an opaque `community_invite` row. It is a **grant**: it
  bypasses the community's join policy and admits the redeemer directly. It is
  therefore the **only** form that works for an `invite_only` community, because
  the code *is* the entry secret. A code may carry a `maxUses`/expiry, records
  `community_membership.invited_by` for [[referral-credit]], and may confer a
  role above `member` when it is a [[role-bearing-invite]] (email-bound,
  single-use).

- **Slug join link** — `/invite/<community-slug>`. A human-readable **standing**
  link that resolves the community by its public slug and joins **per the join
  policy** (`open` → `active`, `approval_required` → `pending_approval`). It
  always grants plain `member`, carries **no** referral attribution, and is
  **refused for `invite_only`** communities.

The `/invite/<token>` resolver tries the code match first, then falls back to a
slug match, then 404s. Codes (opaque hex) and slugs (kebab words) do not
realistically collide, and code-first ordering guarantees a real grant always
wins.

**Why:** Admins wanted a clean, shareable "join my community" URL instead of an
opaque hash. The naive fix — make the invite link just the community slug and
drop codes — was rejected because the code is doing three jobs a bare slug
cannot: it is the bearer secret that makes `invite_only` mean anything (a public
slug appears in every community URL, so a slug-only invite collapses
`invite_only` into `open`); it carries the per-creator attribution that the
[[referral-credit]] economy ([[adr-0018-referral-attribution-honours-global-xp]])
is built on; and it is revocable/expirable, which a community's identity slug is
not. Keeping both forms gives admins the friendly link for the common open-join
case while preserving the security and attribution properties that only a token
can provide. The asymmetry (slug joins earn no referral XP, never work for
`invite_only`) is intentional, not an oversight.

Granting a role *above* `member` by link is the escalation hazard a plain
referral link never had — a forwarded "make-admin" link would let anyone
self-promote. The decision binds every [[role-bearing-invite]] to a single
target email and a single use, and gates creation by `canManageRole`, so a link
can neither out-rank its creator nor be redeemed by anyone but its addressee.

**Rejected alternative:** replace codes entirely with slug-based invite links.
Simplest URL story, but it deletes `invite_only` enforcement, referral
attribution, and revocation in one move. Declined.

**Consequences:**

- `community_invite` gains two nullable columns: `role` (null = plain `member`)
  and `target_email` (null = anyone may redeem). `acceptInvite`/`redeemInvite`
  read `invite.role ?? "member"` rather than hardcoding `"member"`.
- A single `redeemInvite({ token })` procedure backs the `/invite/[token]` page
  and encodes the code-first-then-slug resolution and the `invite_only` refusal.
- The canonical acceptance route moves to `/[locale]/invite/[token]`; the prior
  `/[locale]/join/[code]` stays as a redirect alias so links already shared in
  the wild keep working. `/invite` joins `protectedPaths`.
- Slug joins do **not** write `invited_by`, so they never accrue
  [[referral-credit]]; only code redemptions do.
- Direct **add-by-email** (admin adds an existing AIT account with a role,
  no link) is a separate path from the email-bound [[role-bearing-invite]] and
  shares only the `canManageRole` authority check.
