---
status: accepted
---

# Magazine roles are capabilities read through the editorship seam

A [[magazine]] has a [[magazine-team]] of editors-in-chief, editors and
[[magazine-contributor]]s. This ADR records the contributors slice's
storage, permissions and review boundaries. Sources:
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` (Magazine
staff; Review, credit and where magazine articles show; flows 2 and 4; slice
3), and `docs/superpowers/plans/2026-10-27-community-magazines-contributors.md`
(Decisions 1–7, 9, 11 and 14).

It **amends [ADR-0042](0042-magazine-issues-are-read-through-one-access-resolver.md)**:
the editorship seam remains the only reader of assignments for permission
decisions, but the promise of changing two loaders with "no caller changes"
does not hold. This slice deliberately changes callers to ask for
capabilities. It extends the publication-channel seam of
[ADR-0043](0043-magazine-issue-items-are-a-registry-of-kind-strategies.md).

## Context

- Community owners and admins were the only magazine editors in the core
  slice. Appointed writers and editors need different permissions without
  each page, service or query maintaining its own role list.
- Assignments cross the Payload magazine and Drizzle community membership.
  A stored assignment must never grant access after someone leaves or is
  banned, even when the path that changed membership knows nothing about
  magazines.
- Articles already have review fields and a publication channel. Contributors
  need a hand-in and review flow through those seams, with credit still
  awarded only when their issue publishes.

## Decision

1. **Assignments live in `app.magazine_staff` (plan Decision 1).** This is
   membership-style data written by the site, never a Payload staff
   collection. Fields are `magazine_id` integer (FK to `public.magazines`,
   delete cascades), `community_id` varchar(255), `user_id` varchar(255) (FK
   to `app.user`, delete cascades), `role` varchar(20), nullable `assigned_by`
   (FK to `app.user`, delete sets null), `created_at` and `updated_at`.
   The primary key `(magazine_id, user_id)` allows one role per person per
   magazine; a check permits only the three role values and an index on
   `user_id` supports batched reads.

   `community_id` is copied from the magazine so `loadEditorScope` needs no
   join to a Payload table. A magazine never changes community.
   `Magazines.communityId` has field access `update: () => false` so Payload
   admin cannot move it. Site Local API calls use `overrideAccess` and never
   change that field. This is an access change, with no Payload schema or
   generated type change; the cross-store magazine FK lives in the migration.

2. **Roles grant capabilities through one data table (plan Decision 2).**
   `src/lib/magazines/roles.ts` is client-safe and owns the mapping:

   | Role              | write | edit | manage |
   | ----------------- | ----- | ---- | ------ |
   | `editor_in_chief` | yes   | yes  | yes    |
   | `editor`          | yes   | yes  | no     |
   | `contributor`     | yes   | no   | no     |

   `write` permits writing and handing in articles. `edit` permits building
   and publishing issues, reviewing articles and seeing drafts. `manage`
   permits settings and the team. Callers use
   `standingCan(standing, capability)`, never compare role names. SQL filters use
   `rolesWith(capability)`, derived from that same table. A standing's role is
   for display; the Magazine tab chooses a desk through `roleCan`.

3. **Community leaders are implicit editors-in-chief (plan Decision 3).**
   Active community owners and admins get this standing without a stored
   assignment and cannot be assigned a role (`STAFF_LEADS_COMMUNITY`).
   Moderators are readers unless appointed. The sole community-lead rule is
   `leadsCommunity(communityRole)` in `editorship.ts`, shared by standing
   resolution, editor notification recipients and the team service.

4. **An assignment counts only with active membership (plan Decision 4).**
   Leaving or being banned keeps the row but makes it inert. The team page
   shows it as "Not a member now" and allows removal. The editorship seam
   (`loadMagazineEditorship` and its batched twin `loadEditorScope`) is the
   only reader of this table for permission decisions. The team service may
   list and change assignments; callers receive standing, never raw rows.

5. **Appointed editors-in-chief also manage (plan Decision 5).** The spec
   says owners/admins assign the others; the accepted ruling gives appointed
   editors-in-chief settings and team management too. Those pages live at
   `/communities/[slug]/magazine/settings` and `/communities/[slug]/magazine/team`,
   since an appointed editor-in-chief need not be a community admin. The old
   `/communities/[slug]/settings/magazine` route redirects to the new settings
   page. Changing this permission later is one capability-table change.

6. **Capability chooses the hand-in (plan Decision 6).** `handInFor(canEdit)`
   is the only decision: with `edit`, mark ready (`approved`); otherwise send
   for review (`pending_review`) and notify editors. `MagazineWriting.handIn`
   and `ArticleDestination.handIn` carry the decision to the editor UI;
   `submitMagazineArticle` switches exhaustively on it. ADR-0043's channel
   policies become `submitPolicy: "magazine_review"` (formerly
   `editor_approves`) and `editPolicy: "magazine"` (formerly
   `publishedEditPolicy: "magazine_editor"`). Edits before publication now
   follow that policy too. The channel delegates; the magazine decides.

7. **Contributors change only open articles (plan Decision 7).**
   `isOpenForWriter` means not published and review status absent/null or
   `changes_requested`. `mayWriterChange(canEdit, article)` is exactly
   `canEdit || isOpenForWriter(article)`, shared by the edit page, API update,
   submit and delete, and desk links. Sent, approved and declined articles
   are locked for contributors. Deletion also requires current `write`,
   authorship, and the existing not-published/not-placed checks; removal from
   the team prevents deletion too.

   A save after changes were requested clears the status but keeps the
   editors' note while the writer works. The next hand-in clears the note.
   Checks and writes serialize under an article row lock in a Payload
   transaction (plan Decision 12), so an older autosave cannot change a sent
   article. Writers with `edit` may always edit their own text; this slice
   adds no site flow for editing another contributor's published article.
   **Please check — accepted ruling:** the delete lock intentionally narrows
   the writer's control while the article is with the editors.

8. **Notices use the existing inbox (plan Decision 9).** Notification types
   are `magazine_role_assigned`, `magazine_article_submitted` and
   `magazine_article_reviewed`. Text comes from `messages/en.json`, following
   the badges notifier; links use `metadata.reviewPath` and `linkLabel`.
   Failures are logged and dropped and never fail the action. No email is
   added in this slice.

9. **Unplaced article reads and submission are deliberately narrower than
   the spec (plan Decision 11).** Both narrowings are **please check —
   accepted rulings**:
   - The spec says an unplaced article is visible to its author and magazine
     staff. General article reads remain editors-only; contributors see
     their own text in the article editor, never each other's unplaced text.
     The review page is an editor surface and never indexed.
   - Spec Goal 7 says members can submit articles. In this slice a member
     needs a team assignment granting `write` (or implicit leader standing).
     Ordinary community membership alone does not permit submission.

10. **Unlisted-public confirmation stays with community leaders (plan
    Decision 14).** An appointed editor or editor-in-chief passing
    `confirmUnlistedPublic: true` to `updateIssue` or `saveSettings` gets
    `UNLISTED_PUBLIC_LEADERS_ONLY` (FORBIDDEN). They can still publish
    members-only issues and public issues in listed communities.
    `MagazineStanding.leadsCommunity` carries this distinction. **Please
    check — accepted ruling:** the ADR-0030 exception in ADR-0042 belongs to
    community owners/admins, independently of magazine management.

## Considered options

- **A Payload staff collection:** rejected. Assignments are relational data
  managed by the site, with membership needed for every permission read.
- **Role checks spread across callers:** rejected. A capability change would
  otherwise require finding every gate, query and UI choice.
- **Delete assignments on leave or ban:** rejected. Five membership mutation
  paths would have to remain synchronized; a missed path could leave a live
  role behind. Retained rows gated by active membership grant nothing.

## Consequences

- **ADR-0042's caller promise is amended.** `requireEditorStanding` is
  replaced by capability gates; `loadMagazineWriting` needs `write`; the
  Magazine tab reads the viewer's role through `roleCan`. These caller changes
  are intentional. The read resolver and its rule order stay, with
  `MagazineStanding.isEditor` still meaning "has edit"; parity tests gain
  appointed editors and contributors.
- **A role change is local.** The capability table and `rolesWith` keep gates
  and SQL filters aligned. Retained assignments require every permission
  read to pass through active membership in the editorship seam. A source
  guard keeps role literals in `roles.ts`; implicit leaders use the named
  `COMMUNITY_LEADER_ROLE` from that module.
- **The contributor desk keeps unpublished work visible.** Approved articles
  stay until issue publication; only open rows link to editing (plan Decision
  15, accepted ruling). Approval still grants no publication credit; issue
  publication remains the credit point under ADR-0043.
- **The magazine area now owns review, team and settings.** The shipped routes
  are `/communities/[slug]/magazine/review/[articleSlug]`,
  `/communities/[slug]/magazine/team` and
  `/communities/[slug]/magazine/settings`. The former
  `/communities/[slug]/settings/magazine` redirects to the new settings page.
  Review requires `edit`; team and settings require `manage`. All three pages
  require sign-in, answer unauthorized access with not-found and are not indexed.
- **Published contributor text has no site correction flow.** Editors edit
  only their own articles. Nobody in the site can fix a typo in a contributor's
  published article; allowing editors to edit any article in their magazine
  would be a follow-up (plan Decision 7).
- **Appointed editors-in-chief manage the team and settings.** This extends
  the spec's owners/admins-only assignment rule (plan Decision 5, **please
  check**). Public confirmation in an unlisted community still belongs only
  to active community owners/admins (plan Decision 14). The settings form and
  issue builder currently also show the confirmation box to appointed
  editors; they receive a friendly refusal if they try to confirm. Hiding
  that box for them remains a small follow-up.
- **Retained assignments can become active again.** Rejoining restores an
  inert assignment unless it has been removed. The team page exposes inert
  rows for removal. Someone promoted to community admin appears once, as an
  admin; their stored assignment is inert while they lead and takes effect
  again if they stop being admin and remain an active member (plan Decision 4).
- **Submission and unplaced reads retain two deliberate narrowings.** Only
  team members with `write` can submit; ordinary community membership is not
  enough. Contributors cannot read one another's unplaced articles, though
  each sees their own text in the editor (plan Decision 11, both **please
  check**).
- **Contributors cannot withdraw sent or approved articles.** They must ask
  an editor to decline the article instead; the writer lock applies to
  deletion too (plan Decision 7).
- **Publication earns credit, approval does not.** Each credited article
  grants `ARTICLE_PUBLISHED` XP and contributes to the writer badges. Its
  author also earns `magazine_published` once. Previously credited authors
  receive that milestone through the badge backfill, which Greg runs after
  merge (plan Decision 10).
- **Inbox notices are stored in English.** This follows the existing
  notification system; there is no email or recipient-locale storage in
  this slice (plan Decision 9).
- **Payload's staff queue can still list magazine submissions.** Filtering
  for `pending_review` includes magazine articles. Platform staff should
  leave those to the magazine's editors. An admin approval still follows
  the magazine channel: it marks the article ready and cannot publish it.
