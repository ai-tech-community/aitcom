# Profile visibility governs member-stack faces, never counts

**Status:** accepted

A member's [[profile-visibility]] flag (`member_profile.isPublic`) governs
whether their **face** (display name + avatar) may appear in any aggregate
member display — both the global `/members` directory and the per-[[Community]]
[[member-stack]] on a community card and header. A member who opts out
(`isPublic = false`) is **never shown as a face** but is **still counted**: they
remain part of the community's active-member total and therefore part of the
stack's "+N" overflow. The widening is deliberate — honour the explicit opt-out
for faces, keep the count honest.

Separately, the stack is **never more permissive than the member-list query it
draws from**. On a directory-listed community the faces are world-readable
(modulo the visibility filter above); on an **unlisted** community a non-member
sees **nothing** — no faces and no count — exactly as
`communities.getMembers` already refuses non-members. The root [[Hub]] `ait`
row never renders a stack at all ([[adr-0019-hub-root-is-an-anchor-not-a-tenant]]).

**Why:** `member_profile.isPublic` was introduced with a narrow,
directory-only meaning, and `communities.getMembers` deliberately does **not**
filter on it — a community's member-list page shows everyone the viewer is
allowed to see, opt-out or not. The [[member-stack]] changes the exposure
surface: it puts member faces on a **directory card visible to logged-out
strangers**, which the old member-list page never did. A member who set their
profile private to stay out of the global directory would reasonably be
surprised to find their face advertised on a public community card. Rather than
let the stack silently inherit `getMembers`' face-everyone behaviour, we read
the opt-out as covering *all* aggregate displays. Keeping the opted-out member
in the **count** preserves the social-proof signal and means the card's
"394 members" text and the stack's "+394" overflow can never disagree.

**Considered options:**

- **A — visibility governs faces, not counts (chosen).** Private members are
  filtered out of the shown faces but remain in the total. Least surprising
  reading of an explicit opt-out; count stays truthful.
- **B — stack mirrors `getMembers` exactly.** `isPublic` keeps its
  directory-only meaning; any member of a listed community can have their face
  shown. Rejected: it turns a public card into a new, broader exposure of
  identities the member opted out of, with no notice.
- **C — no public faces at all; counts only on cards.** Faces appear only on
  the header for viewers with member-list access. Rejected: it discards the
  social-proof value that motivated the feature, to solve a problem the
  visibility filter in (A) already solves.

**Consequences:**

- The [[member-stack]]'s face selection must apply the `isPublic` filter; the
  count must not. The ordering rule (leadership-first) composes *after* the
  filter — a private-profile owner is skipped as a face but still leads the
  count.
- The ordering + visibility + access logic lives in **one shared helper**
  consumed by both call sites (the directory list query and the single-slug
  header query), so the policy cannot drift between surfaces. A second copy of
  the rule is the thing to guard against in review.
- The stack must inherit `getMembers`' access decision exactly. The safe
  implementation derives from the same access-controlled path rather than a
  parallel query, so an unlisted community can never leak member identities (or
  a count) to a non-member through the stack as a side channel.
- `member_profile.isPublic` now carries platform-wide meaning ("show my face in
  aggregate displays"), not just "list me in `/members`". Any *future* aggregate
  member display inherits this obligation by default.
