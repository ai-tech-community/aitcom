---
status: accepted
---

# Magazine reading numbers are first-party tallies keyed by a cookieless reader key

An issue's reading numbers describe how often people open it, how many readers
it has, which articles they reach the end of, and which subscriptions and
community joins start there. Sources: the "Stats" section of
`docs/superpowers/specs/2026-10-26-community-magazines-design.md` and
`docs/superpowers/plans/2026-10-28-community-magazines-growth.md`
(Decisions 7, 10 and 11).

It follows [ADR-0042](0042-magazine-issues-are-read-through-one-access-resolver.md)
for access and
[ADR-0046](0046-magazine-issues-are-announced-through-an-outbox-once-per-subscriber.md)
for subscriptions.

## Context

- Editors need numbers for their own issues and articles. No reading event
  store exists, and the activity log records actions by known accounts.
- People can read public issues and previews without signing in. Counting
  them must not require a cookie or store their IP address or browser details.
- A request from the browser is not proof that the person may read the issue
  or article. Editors' own visits should not raise their numbers.

## Decision

1. **Keep tallies in `app.magazine_read` (plan Decision 10).** One row holds
   an issue id, an optional article id, a reader key, views, first and last
   seen times, and the first read-to-end time. A null article id means the
   issue page. `recordMagazineRead` in `stats/reads.ts` is the only writer.
   It uses one upsert against the matching partial unique index: issue and
   reader for issue pages, issue, article and reader for articles. A view
   adds one and updates last seen; read-to-end keeps the first time with
   `COALESCE`. A new read-to-end row has zero views.

2. **Derive a reader key without a cookie (plan Decision 10).** Use
   HMAC-SHA256 with the trimmed `BETTER_AUTH_SECRET`, prefix the message with
   `magazine-reader|`, and keep 32 hex characters. For a signed-in reader,
   the message is `user|<id>` and the key starts with `u`. For a signed-out
   reader, it is `anon|<UTC day>|<ip>|<user agent>` and starts with `a`.
   The day is `YYYY-MM-DD`. No user id, IP or user agent is stored in the
   tally. Without a secret, record nothing.

3. **Check access on every request (plan Decision 10).** The public
   `magazineStats.record` procedure derives the key from the session and
   request headers and allows 120 calls per minute per client IP through
   the existing per-instance limit. An exhausted limit returns
   `{ recorded: false }`. `recordReadFor` uses `loadIssueAccessById`:
   `none` and `editor` record nothing, `teaser` records views only, and
   `full` records views and read-to-end. An article must be published and
   placed in this issue; the check reads ids only, with `draft: false`.
   Read-to-end without an article is refused. The client records a view
   after mount and read-to-end once when the silent sentinel after the
   article body enters view. Failures do not interrupt reading.

4. **Keep where a subscription began (plan Decision 11).** Issue and
   article Subscribe buttons send `sourceIssueId`. The router keeps it only
   when `issueOrigin` identifies a published issue of the same magazine;
   an invalid source is dropped and subscribing still works. Account and
   email subscriptions set `magazine_subscription.source_issue_id` only in
   insert values. Retries and merges never replace the surviving row's
   source, including a missing source. New-subscriber numbers count rows
   with that source only after confirmation.

5. **Reuse the community join log (plan Decision 7).** Communities own
   `JoinSource`, verification, `joinSourceMetadata` and
   `joinSourceCondition`. A magazine join source is verified against a
   published issue of the same community and magazine. It accompanies the
   existing `community.joined` or `community.join_requested` activity row.
   A request counts when its requester is now an active member. There is
   no magazine-specific membership column or second join record.

## Considered options

- **Reading events in `activity_event`:** rejected. It requires an actor id
  and is the audit log that Insights reads; anonymous reading rows would
  mix unrelated records into it.
- **Vercel Analytics:** rejected. Its numbers cannot be queried per issue
  through our own data, and reading counts would depend on an outside service.
- **A counter on the Payload issue:** rejected. Payload saves rewrite the
  columns it owns, and a single counter cannot count separate readers.
- **A source column on community membership:** rejected. The existing join
  log already records the action and is what Insights reads.

## Consequences

- The growth slice shipped preview issues across the access resolver and its
  query twin, join prompts with verified sources, share cards, three issue
  layouts, staff hiding and reading numbers. Editors and editors-in-chief
  see issue views, unique readers, per-article readers and read-to-end counts,
  confirmed subscriptions and joins on the Numbers page. Contributors do not.
- The existing growth migration supplies the read table, subscription source
  column and staff fields; this recording path needs no further migration or
  Payload schema change.
- A signed-in reader has one key across days and devices. Signed-out readers
  count once per UTC day for the same IP and user agent. Shared devices may
  share a key; changing either input makes a different reader.
- A signed-out caller that rotates its user agent counts as a new reader each
  time, bounded only by the 120/min per-IP limit on each server instance.
  A daily cap on new signed-out keys would need its own storage.
- Readers without JavaScript, bots without JavaScript and link prefetches are
  not counted. Reaching the sentinel says the end entered view, not that the
  person understood or read every word.
- Numbers start at this release. There is no backfill. Changing the secret
  changes reader keys, so counts spanning that change may count someone again.
- Joins count only when they start with the issue's join prompt, including
  sign-in carried through that prompt. Subscriptions keep their first stored
  source rather than the most recently pressed Subscribe button.
- Preview issues reach signed-in subscribers through the inbox, including
  non-members who receive only the preview. Email remains public-only. An
  email subscriber to a preview-only magazine receives nothing until a public
  issue is published.
- In unlisted communities a leader's public confirmation also covers a later
  preview. Widening a confirmed preview to public needs a fresh leader
  confirmation; switching to members clears it.
- Preview issue and article pages are indexable unless staff hide the magazine.
  Crawlers and signed-out visitors receive the same limited opening, with no
  full article or editorial body. Preview article structured data marks
  `isAccessibleForFree: false`; preview URLs are absent from the sitemap.
- Staff-hidden magazines leave the Magazines home and sitemap and become
  noindex. Readable links still open. Public articles remain on author
  profiles and in agent search: hiding removes promotion, while the existing
  report flow handles takedowns. Owner settings saves preserve the staff flag.
- Share images use anonymous access and `Cache-Control: no-store`, so a switch
  to members-only takes effect on the next request. Social sites may retain
  their own cached images. Editor-entered covers pass through `safeFetch`
  with a three-second budget, a 2 MB cap and image-only content types; each
  image route allows 30 requests per minute per IP. Origin rendering remains
  a cost under heavy legitimate sharing. The existing generic and badge
  share images keep their inline frames; moving them to `BlackCard` is a
  follow-up on the magazines ticket.
- The served sitemap can lag a visibility change by up to an hour
  (`revalidate = 3600`). Pages, share images, the home and the sitemap data
  function re-check on the next request; a stale URL grants no access.
- Item renderers now accept `size: "lead" | "card" | "row"` and `teaser`
  instead of `lead`. Every future kind must implement all three sizes and
  keep preview content within the same server-enforced limits.
