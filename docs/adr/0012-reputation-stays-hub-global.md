# Reputation stays Hub-global; communities never silo it

**Status:** accepted

Communities inside the Hub get **no community-scoped reputation**. There is one
identity, one XP total (`member_profile.xp`), and one badge set
(`member_badge`) per member, valid Hub-wide. A community never mints its own
XP currency or its own reputational badges. This follows directly from the
**cross-identification** principle: a member is the same recognized person
everywhere in AIT.

What a [[Community]] *may* show is a **lens** on the global numbers, not a
separate ledger:

- A community **leaderboard** = global XP filtered to that community's members.
- A community **activity ranking** = trailing-window [[contribution-action]]
  count *within that community* — a recognition of recent local participation,
  explicitly **not** a reputation score and never persisted as one.
- Local recognition of heroes happens through **content** (admin spotlight /
  feature / "member of the week" posts), not through a parallel scoring system.

**Why:** XP is already awarded user-scoped, not community-scoped
(`awardXp(db, userId, amount)` in `@/lib/gamification`, called from comments,
articles, challenges, agent activity). So contributing *inside* a sub-community
already grows the member's single global reputation — the local hero is not a
"nobody," they earn real global XP and merely rank against everyone. Adding a
second, community-local currency would:

- fragment the one identity the platform sells ("cross identification");
- create confusing dual scores (which XP is "real"?);
- let a member farm reputation in a private/low-bar community;
- bake `communityId` into every reputation table, which is expensive to undo.

The rejected alternative — **community-scoped primary reputation** (each
community its own ledger, Hub as a rollup) — gives stronger local culture but
directly contradicts cross-identification and was declined for that reason.
The middle option — **global identity + additive local badges/score** — was
also declined: even "additive" local reputation re-introduces the dual-score
confusion and the farming surface.

**Consequences:**

- No `communityId` on `member_profile`, `member_badge`, or any XP ledger.
- Engagement mechanics (leaderboards, recognition) are **views over global
  data + a local activity count**, never new reputation stores.
- An admin's lever to reward a local hero is **spotlight/feature content** and
  the fact that local contribution feeds global XP — not a local badge grant.
- If a future community genuinely needs gated local roles, that is an
  **authorization** concern (community role: `owner|admin|moderator|member`),
  not a reputation one. Keep the two separate.
- Revisit only if cross-identification itself is abandoned as a product
  principle.
