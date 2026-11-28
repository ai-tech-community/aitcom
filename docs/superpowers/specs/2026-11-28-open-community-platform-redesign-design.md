# Open community platform redesign

Draft 2026-11-28. Project.

## Intent

Give each community a home that members can navigate without relearning it on every page. One sidebar holds its spaces, one feed starts the conversation, and posting, chat and event registration stay close to the content. Organizers use the same frame to manage the community. Circle supplies the comparison for how people find and use these tools. AIT uses its own design system and keeps its existing capabilities.

## Goals

- **Free to start.** A verified account can create a live community, become its owner, open its first usable space and copy a working invite in one session. This takes no card, payment, trial or staff approval. The community stays live after setup. An organizer can later choose to charge for their own membership through the existing payments system.
- **Open to builders.** Every tenant can issue scoped API credentials, subscribe to signed webhooks and connect an agent through the existing MCP server. Docs and a working example are public. Access follows explicit grants and current community permissions, including the existing human approval boundary for agent-authored drafts.
- **Open between communities.** One Hub account can discover, join and switch between communities. Existing memberships have a direct route back. Public content has canonical, indexable URLs. Directory listing, content visibility and member identity follow ADR-0050 and ADR-0021.
- **Your data is yours.** Owners can download the tenant's members, content, portable settings and owned media in a documented archive and import it into a fresh community. The archive is usable outside AIT. A preview and completion report show what carries over and what depends on account consent, external providers or another community.
- Preserve every route and supported workflow in the inventory. Ship in 15 PRs behind one flag, with the shell first and backend items 12–14 developed alongside it.

## Non-goals

- A new global identity system or a second tenant model.
- A rewrite of the transport layer, the existing publishing workflows or the payment system.
- Reproducing another product's visual design. Use the AIT Town Square system in [PRODUCT.md](../../../PRODUCT.md) and [DESIGN.md](../../../DESIGN.md).

## Anti-goals

- A missing deep link, missing staff action, duplicate discussion record or dead destination in a partially shipped shell.
- A sidebar, search result, unread count, webhook or export that leaks another tenant's content or a private member's identity.
- Turning on the rollout flag as a substitute for passing a role, membership, visibility or payment check.

## Constraints

- One Voice means Signal Orange occupies at most 10% of a screen and marks its one primary action or active state. Use the No-Cream canvas with ADR-0051's scoped theme exception. Use Geist Sans for human copy, Geist Mono for machine labels and a single `/ LABEL` when a section needs a House Kicker. Flat-By-Default applies to the frame, rows and panels. Take tokens from `src/styles/globals.css` and primitives from `src/components/ui/`.
- Support WCAG 2.2 AA, visible focus, keyboard operation, reduced motion and long localized strings. The checked-in runtime supports en, nl and fr in `src/i18n/routing.ts`. Update all three catalogs under `messages/`.
- Keep the Hub anchor, local roles and Hub-global XP. Reuse Better Auth, next-intl, tRPC guards, Payload and the app schema. Add schema through hand-written Payload migrations registered in `src/migrations/index.ts`. Apply forward migrations additively and leave the schema compatible with flag off. Follow `src/migrations/20261128a_community_theme.ts` for small side tables. Use the registered migration runner in `src/server/db/apply-pending-migrations.ts`. Never use Drizzle push or enable Payload push.
- Use the [demo community](2026-11-28-redesign-demo-content.json), [reference capture checklist](2026-11-28-circle-reference-capture.md) and [builder and portability ADR](../../adr/0052-community-scoped-builder-access-and-portable-exports.md).

## Approaches considered

1. **One frame around the existing routes** (chosen). Preserve URLs, providers and domain components. Ship the frame first, then replace individual surfaces behind the same flag.
2. **A new URL subtree and second application shell.** It would require parallel links, caches and visibility checks for the same content and would make the route parity contract harder to maintain.
3. **Replace the old shell in place in the first PR.** This would change production navigation before the downstream surfaces had proved parity and remove the rollback path.

## Decisions

### Shell anatomy

- **Layout and providers.** `src/app/[locale]/layout.tsx` remains the document boundary and owns locale, tRPC, Better Auth session, rules, inbox, space windows, toasts and the single main landmark. Extend the path-based chrome policy in `src/components/site-chrome-gate.tsx` so a standard community route has one header. Keep the server query prefetch and user/membership seed in `src/app/[locale]/communities/[slug]/layout.tsx` and the outsider gate, join deep link and child slots in its `_community-layout-client.tsx`. Share server and client data paths between shells.
- **Desktop sidebar.** From the existing `lg` breakpoint, put the community identity and switcher first, Home next, then ordered, collapsible space groups. Reuse `src/components/communities/community-identity.tsx` for identity and its join controls. Use the localized names, positions, archived state and access-filtered rows consumed by `src/components/communities/community-nav.tsx`, `src/server/api/routers/spaces.ts` and `src/server/communities/space-defaults.ts`. Keep ungrouped spaces in their current order under Spaces. A group with no visible spaces is absent. Preserve the role-gated Manage links. A visible room that requires approval keeps its lock and request path. Preserve active styling on detail URLs, open the active group, and keep sidebar scroll separate from content.
- **Switcher.** Open a searchable list of the signed-in user's active, usable memberships from `src/server/better-auth/hub-session-server.ts` and `src/server/communities/my-communities.ts`. Pin a distinct Hub entry and offer Discover and My communities. Pending, banned and lapsed memberships cannot appear as usable spaces. Pending requests can still be managed from the existing account surfaces. Switch to the target community's Home in the same locale, with its theme and role recalculated before showing any scoped rows or counts. Guests get Hub and Discover links.
- **Unread state.** Reuse room read markers and authorized counts from `src/server/communities/room-unread.ts` and the room queries. Item 1 shows those counts and the existing global DM and notification badges. A count is absent when the underlying data is unavailable or access has lapsed. Item 3 adds discussion unread indicators from read cursors. Only aggregate visible rows into a group, pair badges with accessible labels and update cursors after the content is visible. The switcher can show per-community unread only where the totals derive from authorized scoped data.
- **Header and search.** One compact header identifies the active page and offers Search, notifications, inbox and account/language. Keep Join near the community identity for eligible outsiders. Use `src/components/navbar.tsx`, `src/components/site-nav.ts`, `src/components/notifications/notification-bell.tsx` and `src/components/inbox/messages-nav-link.tsx` as the existing entry points. Item 1 exposes Search through `src/components/ui/command.tsx` for visible destinations. Item 8 adds content results with a Community/Hub scope switch. The header and mobile entry open the same controls.
- **Mobile.** Below `lg` use a top bar and a bottom bar with Home, Spaces, Messages and More. Spaces opens a drawer with the same switcher, groups, unread and Manage links. More exposes Hub destinations and account shortcuts. Restore focus on close, announce the active destination, respect safe areas and the on-screen keyboard, and close the drawer after navigation. Drawers and compose controls share the existing overlay providers. Keep a single scroll context for the page and use the existing mobile inbox presentation.
- **Theme and full-screen views.** Put the standard community header, sidebar and page inside one `src/components/communities/theme/community-theme-scope.tsx` and reuse `community-theme-preview.tsx` and `community-theme-cover.tsx` in that directory. Prefetch the theme before render. A saved banner wins over catalog art. Keep `src/components/ui/portal-container.tsx` for frame-owned overlays and the ADR-0051 behavior of root overlays. Use `src/lib/communities/layout-variant.ts` to preserve plain full-screen event editors, the course builder and the issue builder. Preserve the independent `src/components/magazines/reading/magazine-shell.tsx` with its own community return link. Keep the settings, event manage, hackathon, member profile and dashboard layouts in charge of their existing permissions and inner navigation.
- **Hub and account destinations.** The same header language and primitives support a Hub view. Its navigation exposes Discover, Events, Magazines, Launchpad, Jobs, News and Investigations without selecting a tenant. Public directories and detail pages keep their URLs, canonical metadata, and local widths. The Hub view links into community pages where there is a permitted local counterpart. Dashboard, payments, onboarding and the agent workspace sit under Account with their existing route-group frames. Full-page Messages and Notifications are account-wide. Leaving a tenant for a Hub, auth or account page drops tenant styling and context. The public home, legal pages, share images and magazine reading retain their existing page-specific formats.

### Rollout flag

Use `NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES`. Follow the validated boolean-string pattern in `src/env.js` and the shared reader pattern in `src/lib/chat/flags.ts`. Define one reader, proposed at `src/lib/communities/redesign-flag.ts`, default `"false"`. The locale and community layouts resolve the same value on the server and pass it to client chrome and page variants. Flag-gated server actions, tRPC procedures, REST and MCP additions check that reader server-side. The existing chat and payments flags remain separate dependencies for their existing capabilities.

`NEXT_PUBLIC_` is compiled into the client bundle. Build and deploy server and client artifacts with the same value. Roll back by deploying a matching off build. The flag is deployment-wide. Production stays off while flagged previews exercise completed slices. Both shells share URL, auth, permissions, queries and mutations where behavior is shared. Each PR adds exactly its own destinations, and incomplete surfaces keep their old pages inside the new frame. With the flag off, new endpoints return the normal missing-route response and new builder MCP tools are omitted. Existing endpoints and tools remain available. Pause new flagged jobs without discarding their state, and preserve authorization on any previously issued download link.

Once all 15 items pass the release gate, deploy on, check the canaries and record the rollback window. Remove legacy render branches, the flag reads and its env declaration after that window. Keep compatible data migrations, durable URLs, redirects and shared services.

### Current route inventory

This is the no-feature-lost contract for `src/app/[locale]/`. Paths omit the locale and Next.js route groups. `C` means `/communities/[slug]` and `D` means `/dashboard`. Multiple paths in a row share one primary item. A feature can also be used by another item, as recorded below. The four localized route handlers are included for share link parity.

| Current paths | Purpose | Item |
| --- | --- | --- |
| `/` | Public landing page, featured communities, events, magazines and news | 11 |
| `/[...rest]` | Unknown-path 404 | 1 |
| `/privacy`, `/security`, `/terms` | Policy and security pages | 1 |
| `/og` | General share image response | 1 |
| `/communities`, `/discover` | Directory, recommendations, Explore, and the legacy Discover redirect | 11 |
| `C` | Community Overview, about, feed and join state | 2 |
| `C/forum`, `C/forum/[threadSlug]` | Tenant forum and threads, replies, rules and moderation | 3 |
| `/community`, `/community/[slug]` | Legacy Hub community board and old forum detail redirect | 3 |
| `/forum`, `/forum/new`, `/forum/[slug]` | Hub forum, new thread and detail | 3 |
| `C/spaces/[spaceSlug]` | Room lobby, membership and room conversation | 4 |
| `/messages`, `/messages/[conversationId]` | Account inbox and authorized conversation deep link | 4 |
| `C/events`, `C/events/new`, `C/events/[eventSlug]/edit` | Local calendar and organizer creation/editor | 5 |
| `C/events/[eventSlug]/attendees` | Organizer registration roster and check-in | 5 |
| `C/events/[eventSlug]/judge` | Hackathon judge desk | 5 |
| `C/events/[eventSlug]/manage`, `C/events/[eventSlug]/manage/analytics`, `C/events/[eventSlug]/manage/lifecycle`, `C/events/[eventSlug]/manage/tasks` | Hackathon setup, analytics, lifecycle and tasks | 5 |
| `/events`, `/events/[slug]`, `/events/world-summit-ai-amsterdam-2026` | Hub event directory, canonical event/RSVP page and curated summit page | 5 |
| `/events/[slug]/agents`, `/events/[slug]/gallery`, `/events/[slug]/participants`, `/events/[slug]/projects` | Hackathon agents, gallery, participants and projects | 5 |
| `/events/[slug]/team`, `/events/[slug]/timeline`, `/events/[slug]/winners`, `/events/[slug]/workspace` | Hackathon teams, milestones, results and participant workspace | 5 |
| `D/events` | Personal upcoming and past events | 5 |
| `C/classroom`, `C/classroom/new`, `C/classroom/[courseSlug]`, `C/classroom/[courseSlug]/edit` | Course list, creation, course and lesson player, builder | 6 |
| `C/members` | Tenant People directory and old matching-tab redirects | 7 |
| `/members`, `/members/[id]`, `/members/[id]/activity`, `/members/[id]/agent`, `/members/[id]/work` | Hub members/leaderboard and member profile, activity, agent and work tabs | 7 |
| `/members/[id]/badges`, `/members/[id]/badges/[slug]`, `/members/[id]/badges/[slug]/image` | Member badges, award detail and share image | 7 |
| `D/notifications`, `/unsubscribe` | Notification inbox, introductions consent and email opt-out | 8 |
| `/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password` | Account entry, verification continuation and recovery | 9 |
| `/join`, `/join/[code]`, `/invite/[token]`, `/invitations/unsubscribe` | Hub joining, invite alias and redemption, invitation opt-out | 9 |
| `D/onboarding`, `D/payments`, `/my-payments` | Onboarding questions, member purchases and legacy payment return URL | 9 |
| `D`, `D/settings` | Account dashboard, Next Up, activity and settings including linked identities and account deletion | 10 |
| `C/settings`, `C/settings/general`, `C/settings/ownership`, `C/settings/themes` | Settings redirect, community identity/join policy, ownership and themes | 10 |
| `C/settings/members`, `C/settings/invites`, `C/settings/spaces`, `C/settings/rules` | Member roles/moderation, invite management, space composition and rules | 10 |
| `C/settings/links`, `C/settings/topics`, `C/settings/classroom`, `C/settings/matching` | Curated links, feed topics, classroom controls and matching configuration | 10 |
| `C/settings/acquire`, `C/settings/autonomy`, `C/settings/broadcast`, `C/settings/integrations` | Acquisition, autonomy, broadcast and integrations controls | 10 |
| `C/settings/magazine`, `C/settings/news`, `C/settings/payments` | Magazine settings alias, news sources and offer/payment administration | 10 |
| `D/communities` | Joined communities, management and pending requests | 11 |
| `C/gallery`, `C/launchpad`, `C/ideas`, `C/match` | Gallery, community projects, idea voting and matching | 15 |
| `C/offers`, `C/offers/[offerId]` | Offer browsing and purchase entry. Item 9 owns the paid join flow | 15 |
| `C/reels`, `C/rituals`, `C/referrals`, `C/insights` | Short video, recurring rituals, invite attribution and organizer insights | 15 |
| `C/magazine`, `C/magazine/write`, `C/magazine/articles/[articleSlug]/edit`, `C/magazine/review/[articleSlug]` | Magazine desk, contribution, editing and review | 15 |
| `C/magazine/issues/[issueId]/edit`, `C/magazine/issues/[issueId]/stats`, `C/magazine/agent-issues/[draftId]`, `C/magazine/auto-draft` | Issue builder, reading statistics, agent draft review and automatic drafts | 15 |
| `C/magazine/settings`, `C/magazine/team` | Publication settings and editorial team | 15 |
| `/magazines`, `/magazines/[magazineSlug]`, `/magazines/[magazineSlug]/[issueSlug]`, `/magazines/[magazineSlug]/[issueSlug]/[articleSlug]` | Discovery, shelves, issue and article reading | 15 |
| `/magazine-subscriptions/confirm`, `/og/magazine/[magazineSlug]/[issueSlug]`, `/og/magazine/[magazineSlug]/[issueSlug]/[articleSlug]` | Subscription confirmation and magazine share images | 15 |
| `/launchpad`, `/launchpad/new`, `/launchpad/[slug]`, `/launchpad/[slug]/edit`, `/ideas` | Hub project listing, creation, detail, editing and ideas board | 15 |
| `/jobs`, `/jobs/[roleSlug]`, `D/jobs`, `/roles` | Job board, role details, personal job desk and AIT roles | 15 |
| `/news`, `/news/stories`, `/news/stories/[slug]`, `/news/stories/contribute` | News archive, stories, story detail and contributions | 15 |
| `/news/stories/drafts`, `/news/stories/drafts/[draftId]`, `/news/stories/manage` | Draft queue, draft review and management | 15 |
| `/blog`, `/blog/[slug]`, `/blog/write`, `/blog/edit/[slug]`, `/blog/my-articles` | Blog, articles/comments and authoring desk | 15 |
| `/agents`, `/claim/[token]`, `D/agent`, `/setup` | Agent catalog, ownership claim, agent dashboard and Hub setup guide | 15 |
| `/guides/agent-ready-community`, `/guides/mcp-registry-vs-community-hub`, `/guides/register-agent-mcp` | Agent and MCP guides. Item 13 links to and from these | 15 |
| `/investigations`, `/investigations/awesome-ai-oss`, `/investigations/awesome-ai-oss/insights`, `/investigations/awesome-ai-oss/review` | Investigations index, open-source AI directory, insights and review queue | 15 |
| `/investigations/datacenters`, `/investigations/datacenters/energy-growth`, `/investigations/datacenters/market-power`, `/investigations/datacenters/red-flags` | Datacenter dashboard and analysis tabs | 15 |
| `/investigations/datacenters/[slug]`, `/investigations/datacenters/method`, `/investigations/operators/[slug]`, `/investigations/startups/[slug]`, `/investigations/suppliers/[slug]` | Facility, methodology, operator, startup and supplier detail | 15 |
| `/startups`, `/startups/[slug]`, `/startups/ai-tools-list`, `/startups/claim`, `/startups/insights`, `/startups/submit` | Startup discovery, detail, tools, claims, insights and submissions | 15 |
| `/collectors/about`, `D/collectors`, `D/collectors/new/[presetId]`, `D/collectors/opt-outs`, `D/collectors/runs`, `D/collectors/runs/[runId]` | Collector information, presets, opt-outs and personal run desk | 15 |
| `/sponsors` | Sponsor directory, tiers and application entry | 15 |

Items 12–14 gain new routes. Item 12 also owns the existing create dialog wherever it opens. Item 13 extends the existing non-localized `/api/mcp` in place. Item 14 adds community-wide portability alongside the existing payment and collector exports, which retain their own authorization.

Layouts and loading states inherit their route's owner. Item 1 owns the localized root layout and not-found page. Item 10 owns shared dashboard frames, item 9 owns the auth and onboarding layouts, and item 15 owns the agent, collectors, magazine issue, insights, rituals and investigation layouts. Item 5 owns event manage and event detail layouts, and item 7 owns the profile layout. In the crawl, exercise the event, job and profile loading states as part of their owning routes.

### Item 1 — Shell and navigation

- **Scope and routes.** Deliver the shared chrome, sidebar, switcher, theme and mobile behavior above. Own the locale frame, community frame and the item 1 inventory paths. Keep the child pages in their current slots.
- **Reuse and data.** Use the prefetch, frame, space and role seams above. Add nullable group association and ordered group records through additive side tables keyed by community and space. Existing spaces read as ungrouped, with no backfill. Persist collapse preferences per viewer and community in the browser. Item 10 owns the group editing UI.
- **Reference and acceptance.** The blind critic picks AIT over Circle's Home sidebar, header and switcher for finding a space and moving between communities with context intact. The parity gate passes, including keyboard and mobile navigation, a private outsider, Plain and Night, and full-screen workspace transitions.

### Item 2 — Community home feed and composer

- **Scope and routes.** Own `C`. One stream, with pinned content and topic filters above it. Open the existing editor in place with a visible destination, an unsent draft state and a clear retry. Keep About, curated links, welcome checklist, real activity, reels and news entry points as secondary content. Item 3 adds selection of a discussion space once those destinations ship.
- **Reuse and data.** Keep `src/components/communities/feed/feed-page.tsx`, `post-composer.tsx`, `editor/post-editor.tsx`, `feed-post-card.tsx` and `community-sidebar.tsx` in that directory. Reuse `src/server/api/routers/feed.ts` and `src/collections/FeedPosts.ts` for policy, pins, polls, mentions, GIF, images, video, reporting, likes and comments. No new store.
- **Reference and acceptance.** The blind critic picks AIT over Circle Feed for scanning, starting a draft and publishing with a clear destination. The parity gate passes for media, replies, moderation, draft recovery, topic filters, and posting as a member or a read-only visitor.

### Item 3 — Discussion spaces and post detail

- **Scope and routes.** Own tenant and Hub forum, the legacy board and aliases in the inventory. Add a discussion destination under `C/spaces/[spaceSlug]` with item 4's room variant dispatched by the existing space record, and a canonical feed post detail at `C/posts/[postId]`. A discussion post appears once on Home and in its space. Keep legacy forum records, rules, links, pins, locks, replies and moderator actions in place. Give the forum a discoverable home in the new sidebar. Keep ritual and greeter source links working. ADR-0026 defines the feed as the discussion home.
- **Reuse and data.** Use `src/components/forum/forum-page.tsx`, `src/components/forum/community-thread-detail.tsx`, `src/components/communities/feed/feed-comments.tsx`, `src/server/api/routers/forum.ts` and `src/server/communities/forum-write-access.ts`. Add a discussion space kind with a same-community post association, an optional feed post title and per-member discussion read cursors. A null association stays in the existing community feed. A topic remains an independent label. Discussion spaces inherit community access and existing post visibility, which the feed and post detail both enforce. The old feed must render a new titled record with its title and body in flag-off mode, and old readers must tolerate the new kind. Resolve publications and deep links to the source record.
- **Reference and acceptance.** The blind critic picks AIT over Circle post-space list and detail for locating, reading and replying to a discussion. The parity gate passes for old and new deep links, permissions, existing forum creation and moderation, draft approval, and unread state.

### Item 4 — Chat and direct messages

- **Scope and routes.** Own the room/lobby variant of `C/spaces/[spaceSlug]`, `/messages`, `/messages/[conversationId]` and the parallel space windows. Keep join/request/leave access states, direct and owner–agent conversations, rich messages, unread and reconnect. Add in-room replies to a parent message so a busy room can keep side conversations attached to their context.
- **Reuse and data.** Use `src/components/communities/rooms/room-view.tsx`, `src/components/communities/explore/space-window-provider.tsx`, `src/components/inbox/inbox-provider.tsx`, `src/components/inbox/message-composer.tsx` and `src/server/api/routers/inbox.ts`. Keep ADR-0025 SSE at `src/app/api/inbox/stream/route.ts`, Upstash publish in `src/server/inbox/publish.ts`, optimistic sends and the foreground fallback in `src/components/inbox/use-inbox-stream.ts` and `live-refetch.ts` in that directory. One subscription per client. Add a nullable parent ID for room replies and enforce same conversation, tenant and viewer access on read and write. The off shell can render replies in room chronology.
- **Reference and acceptance.** The blind critic picks AIT over Circle chat, threads and DMs for sending, reading and resuming a conversation. The parity gate passes for access revocation, duplicate delivery, reconnect, room requests and DM deep links.

### Item 5 — Events

- **Scope and routes.** Own all tenant, Hub, special event and My Events paths in item 5. Keep the canonical event page, RSVP and registration questions, calendar links, external registration, event editing, attendees and check-in, and the full hackathon participant, judge and organizer flow.
- **Reuse and data.** Use `src/components/communities/events/community-events.tsx`, `src/components/events/registration-dialog.tsx`, `src/components/events/editor/event-editor.tsx`, `src/components/events/organizer-attendee-list.tsx`, `src/server/events/public-event-access.ts`, `src/server/hackathon/load-manage.ts` and `src/collections/Events.ts`. Keep attendee answers behind the organizer-only boundary in ADR-0038. No schema change.
- **Reference and acceptance.** The blind critic picks AIT over Circle Events from list to RSVP and from organizer event to attendees. The parity gate passes for public/private and cancelled events, local/external registration and all hackathon roles and states.

### Item 6 — Classroom

- **Scope and routes.** Own all `C/classroom` paths. Make course discovery, resume, lesson progression and editing predictable. Keep existing publication, course access, materials and Mux playback, exams, lesson conversation and notes, completion and certificates.
- **Reuse and data.** Use `src/components/classroom/classroom-listing.tsx`, `src/components/classroom/course-view.tsx`, `src/components/classroom/builder/course-builder.tsx`, `src/server/api/routers/classrooms.ts` and `src/collections/Courses.ts`, `Modules.ts` and `Lessons.ts` in that directory. Preserve the optional module and current lesson navigation. No schema change.
- **Reference and acceptance.** The blind critic picks AIT over the Circle course landing, player and curriculum editor for resuming a lesson and editing an outline. The parity gate passes for published/draft, learner and author roles, progress, media, exams and certificate access.

### Item 7 — Members and profiles

- **Scope and routes.** Own `C/members`, `/members` and its profile tabs, badges and share images. Make it easy to find a person, see their work and message them where permitted. Preserve Hub leaderboard and XP, agent profiles and old matching-tab links into item 15.
- **Reuse and data.** Use `src/components/communities/matching/members-hub.tsx`, `src/server/members/profile-page.ts`, `src/server/members/profile-access.ts`, `src/server/members/displayable-badges.ts` and `src/server/api/routers/members.ts`. Keep Hub-global XP and the badge catalog. No schema change.
- **Reference and acceptance.** The blind critic picks AIT over Circle directory, profile and leaderboard for finding the right person and understanding their contributions. The parity gate passes for private profiles, rosters, agent tabs, awards and legacy links.

### Item 8 — Notifications and search

- **Scope and routes.** Own `D/notifications`, `/unsubscribe` and the header search and bell. Keep mark read, preferences, digest opt-out, moderation notices and introduction consent. Search uses an explicit Community or Hub scope, grouped results, keyboard selection, and empty/error states. Include communities, spaces, posts, threads, courses, events and members where visible. Keep DMs outside site-wide search.
- **Reuse and data.** Use `src/components/notifications/notification-panel.tsx`, `src/components/notifications/notification-prefs.tsx`, `src/server/api/routers/notifications.ts`, `src/components/ui/command.tsx` and `src/server/communities/content-access.ts`. Use bounded queries over existing stores and verify access at result construction and destination load. Return results grouped by type with the source community shown on Hub-wide results, and keep the current scope and query when a member backs out of a result. Add an index only if the measured query plan needs it. No new search datastore in this slice.
- **Reference and acceptance.** The blind critic picks AIT over Circle search and notifications for finding a result and clearing a notice without losing place. The parity gate passes for preferences, opt-out and stale or revoked results, including counts, snippets and autocomplete across tenants.

### Item 9 — Join and onboarding

- **Scope and routes.** Own auth, join, invitation, onboarding and account payments routes in the inventory. Own paid join inside item 15's offer routes and join prompts inside the shell. Cover verification, sign-in and recovery with return destination, open join, invitation, approval request, private landing, offer checkout and first-week onboarding.
- **Reuse and data.** Use `src/app/[locale]/auth/signup/signup-form.tsx`, `src/components/communities/join-button.tsx`, `src/components/communities/use-community-join.ts`, `src/server/communities/invite-policy.ts`, `src/server/communities/activate-membership.ts`, `src/components/communities/onboarding/welcome-checklist.tsx`, `src/components/communities/payments/offer-purchase-view.tsx` and `src/server/payments/access.ts`. No schema change.
- **Reference and acceptance.** The blind critic picks AIT over Circle sign-up, invite acceptance, onboarding and paywall for clarity from first click to useful content. The parity gate passes for existing accounts, membership states, expiry, approval, role-bearing invites and checkout return/failure.

### Item 10 — Admin and settings

- **Scope and routes.** Own every existing `C/settings` page or redirect, `D` and `D/settings`. Keep reachability of account preferences and organizer actions, including broadcasts, themes, integrations, roles, rules and ownership. Put group edit and ordering in Spaces. Preserve magazine-specific settings in the editorial desk. Developer and Portability pages are owned by items 13 and 14.
- **Reuse and data.** Use `src/components/communities/settings/settings-sidebar.tsx`, `compose-spaces.tsx`, `members-settings.tsx` and `theme-settings.tsx` there, plus `src/server/api/routers/communities.ts`, `src/server/api/routers/spaces.ts` and `src/components/dashboard/member-dashboard-frame.tsx`. Write to item 1's group tables and keep current order semantics for old readers. Use the existing owner, admin and moderator gates per action.
- **Reference and acceptance.** The blind critic picks AIT over Circle Settings, Spaces and Audience for locating and safely operating a setting. The parity gate passes for every settings page, including hidden/archived spaces, member management, theme preview and owner-only controls.

### Item 11 — Discovery between communities

- **Scope and routes.** Own `/`, `/communities`, `/discover` and `D/communities`. Keep `/discover` resolving to the canonical discovery page at `/communities`. Preserve existing facets, featured/recommended results, Explore and rooms. Provide visible paths from Hub and the switcher to browse, join and return. Verify public content indexing and anonymous discussion/course reads against item owners before including a URL.
- **Reuse and data.** Use `src/components/home/home-sections.tsx`, `src/components/communities/communities-directory.tsx`, `src/components/dashboard/my-communities/my-communities.tsx`, `src/server/communities/directory.ts`, `src/server/communities/discovery-queries.ts`, `src/server/communities/content-visibility-queries.ts` and `src/app/sitemap.ts`. No new membership, ranking store or account. Listed private communities retain their ADR-0050 public front door, with interior pages and activity gated. Include only anonymously readable, canonical content in the sitemap. Apply noindex to restricted front-door states on interior URLs and avoid sharing cached member results with anonymous readers.
- **Reference and acceptance.** The blind critic picks AIT over Skool Discovery for understanding an unfamiliar community, choosing one and returning under the same account. Record Circle Discover and the switcher as context, using the capture checklist. The parity gate passes for discoverable listed-private front doors, hidden and unlisted data, canonical locale URLs and account continuity.

### Item 12 — Free self-serve creation

- **Scope and routes.** Own the existing create dialog, and propose `/communities/new` as the flagged, linkable setup flow. Ask for name and optional description, show the join and listing defaults, provision an active owner and immediately usable Welcome space and show a copyable member invite on success. Returning from verification resumes setup. Surface a localized collision and resume the same result after a retry or lost response.
- **Reuse and data.** Extract the shared provisioning operation from `src/server/api/routers/communities.ts`, using `src/components/communities/create-community-dialog.tsx`, `use-create-community-deep-link.ts` in that directory, `src/server/communities/slug-utils.ts`, `seed-default-spaces.ts` and `invite-policy.ts` in that server directory. The existing create endpoint and default builtins stay available. Seed Welcome as a joinable room inside the tenant, with an active room membership for the creator. Reuse the room creation pattern in `src/server/api/routers/spaces.ts` and the conversation resolver in `src/server/communities/room-conversation.ts`. Returning from the initial invite offers the new member the Welcome room. Reserve the provisioning request table below.
- **Reference and acceptance.** The blind critic picks AIT over Circle's create-community task for completing setup and sharing an invite. The parity gate passes for concurrent or replayed submissions, rollback after failure, a guest following the link and the original create dialog.

### Item 13 — Builder platform

- **Scope and routes.** Add proposed `C/settings/developers`, public `/developers`, and `/api/v1/communities/[communitySlug]/...`. Ship a quickstart and OpenAPI contract, token/rotation controls, subscription management, test delivery and delivery history. Start with spaces, published posts, event summaries and the agent draft path. Publish webhook topics for community posts, events and membership with minimal payloads. Extend the existing `/api/mcp` with community-bound tools.
- **Reuse and data.** Follow ADR-0052. Reuse `src/server/agent/api-key.ts`, agent auth in `src/server/api/trpc.ts`, `src/app/api/mcp/server.ts` and `src/server/mcp/catalog.ts`. Use `src/server/agent/deliver-event.ts` and `src/server/payments/outbox.ts` as the signed delivery and durable outbox precedents. Reserve the token, subscription, outbox and delivery tables below.
- **Reference and acceptance.** The blind critic picks AIT over the corresponding Circle developer setup, API and webhook task for a working integration with visible permissions and failures. The parity gate passes for free-tenant availability, revocation, tenant isolation, webhook retry/signature and the existing agent catalog and approval paths.

### Item 14 — Export and portability

- **Scope and routes.** Add proposed `C/settings/portability` and authenticated job/status/download/import handlers. An owner can start an export, return to see progress, download it, validate an import and restore to a fresh community. Show scope and omissions before export/import, and give a result with counts, identity mapping and migration warnings. After download, the owner can use the archive elsewhere or follow the existing ownership transfer path in `src/components/communities/settings/ownership-settings.tsx`. Protect downloads and run offers, payments and invitations through their existing surfaces.
- **Reuse and data.** Follow ADR-0052. Use `src/server/collectors/runs.ts` as the claimable job precedent, `src/server/collectors/export/formats.ts` for export formatting patterns, `src/server/media/object-storage.ts` for private objects, and the existing `src/app/api/payments/export/route.ts` as a distinct access-checked export precedent. Reserve export/import jobs and staging below.
- **Reference and acceptance.** The blind critic picks AIT over the Circle export task and rates its round trip against Ghost's import/export craft. The parity gate passes for manifest completeness, round-trip associations and media, access revocation, second import retry and archived data exclusions.

### Item 15 — AIT extras in the shell

- **Scope and routes.** Own all item 15 inventory paths. Use standard tenant chrome for gallery, launchpad, ideas, match, offers, reels, rituals, referrals, insights and the magazine desk. Hub extras use Hub navigation. Keep independent magazine reading and editor frames. Preserve every author/review flow, public share route, empty state, access gate and return link. Keep jobs, collectors and agent tools reachable from account surfaces.
- **Reuse and data.** Use `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/editor/builder/issue-builder.tsx`, `src/server/magazines/issue-access.ts`, `src/components/communities/gallery/gallery-page.tsx`, `src/components/launchpad/launchpad-listing.tsx`, `src/server/api/routers/ideas-filter.ts`, `src/components/communities/matching/find-a-match.tsx`, `src/components/communities/payments/community-offers.tsx`, `src/components/communities/reels/reels-viewer.tsx`, `src/components/communities/rituals/rituals-manager.tsx`, `src/components/communities/referral/referral-panel.tsx` and `src/components/communities/insights/insights-dashboard.tsx`.
- **More reuse.** Keep `src/components/investigations/startups-jobs-page.tsx`, `src/components/news/news-table-browser.tsx`, `src/server/api/routers/articles.ts`, `src/app/[locale]/dashboard/(agent)/agent/content.tsx`, `src/components/investigations/awesome-ai-oss-page.tsx` and the corresponding existing pages in the inventory. No schema change.
- **Reference and acceptance.** The blind critic picks AIT for craft against the chosen polished Circle spaces, scoring hierarchy, rhythm, empty/error states and fit with items 1–3. The parity gate passes for all item 15 routes and roles, including private media/gallery moderation, magazine editorial permissions, agent claim, collector access and return from an editorial workspace.

### Items 12–14 data model

Names below are reserved for one forward migration per item. Model app relations in `src/server/db/schema.ts` and use the existing Payload collection definitions to access content. Each migration is additive and independent of later slice schema.

| Item | Reserved migration | Additions and invariants |
| --- | --- | --- |
| 12 | `src/migrations/20261201a_community_provisioning.ts` | `app.community_provision_request` keyed by creator user ID and request key. Store normalized request hash, resulting community ID, initial space ID and ordinary invite ID. Commit request, community, ownership, space, room membership and invite together. Unique community slug and existing invite code constraints remain the final arbiter. Default to unlisted and invite-only, using existing signup verification and no new tenant table or billing record. |
| 13 | `src/migrations/20261201b_community_builder_platform.ts` | `app.community_api_token` holds community, issuer, label, prefix, hash, scopes, lifecycle timestamps and optional linked agent/key identity for narrowly delegated MCP. `app.community_api_idempotency` holds scoped request hashes and replay results. `app.community_webhook_subscription` holds HTTPS endpoint, topic allowlist, encrypted signing secret and rotation state. `app.community_webhook_event` is the committed event outbox. `app.community_webhook_delivery` records one logical delivery per subscription and event, with per-attempt metadata in `app.community_webhook_attempt`. |
| 14 | `src/migrations/20261201c_community_portability.ts` | `app.community_export_job` holds community, requester, request ID, status, timestamps, source cutoff, manifest version, object key/checksum and safe error code. `app.community_import_job` holds target/owner, archive digest, validation report, state and resumable ID map. `app.community_import_stage` tracks unpublished rows and media until a validated import is ready to apply. Lease jobs, record retries and enforce one active export per community and one import claim per fresh target. |

Use existing scoped IDs and composite uniqueness or foreign keys where app tables support them. Validate the community relationship before resolving Payload references. With the flag off, older readers tolerate untouched side tables plus nullable fields. A missing required migration blocks the new write with an actionable unavailable state. Flag rollback keeps the schema and the stored work.

## Slices

1. Item 1 is the first PR to land. Items 12, 13 and 14 develop in parallel against existing tenant, ACL and provider seams. Each is a separate PR. They can use the shell's settings/navigation slots when it lands. Item 14 accepts supported content type adapters as they become available, and the final gate covers all types from the release.
2. Items 2–11 and 15 follow the shell. Item 3 connects the space chooser in item 2 and shares route dispatch with item 4. Item 10 edits the groups from item 1 and exposes links to available 13/14 routes. Item 15 checks the complete navigation with the new item 1–3 surfaces in place.
3. Review each item in a flagged preview. Record its critic result and parity evidence on its own PR. Keep production off until the end-to-end gate passes. Flag removal follows stable release, through the cleanup described above.

## Verification

### Blind critic

Use the [capture checklist](2026-11-28-circle-reference-capture.md) and one shared content fixture. Give the critic shuffled pairs and equivalent starting roles, viewport and content. Conceal product labels in the review packet where possible, preserve the original captures and record when product identity is apparent. Score completion, clarity, steps/recovery and craft using the task set for the item. Every item needs an explicit AIT preference. A tie or a preference for the reference needs another iteration. Record the evidence and any reference capability blocked by a plan or unavailable in the browser.

### Parity gate

- Build paired flag-on and flag-off previews from the same revision. Crawl every App Router page in the inventory with both variants and include the localized share endpoints. Generate the manifest from the source tree so newly added pages must have an owner. Expand dynamic routes with representative IDs and cover query states, legacy aliases, redirect targets, 404s and noindex. Include signed out, public outsider, private outsider, invited, pending, active member, lapsed, moderator, admin, owner, and the applicable editor, organizer and judge roles. Use direct navigation and reload to test deep links. Compare status, destination, accessible actions, content and association identity. Check for missing commands, private-data leaks, duplicate chrome and broken translations. Record any existing access exception that is specific to a surface, including magazine teasers.
- Exercise important writes and state transitions on an isolated test fixture. Keep CI's full suite and type-check for every touched workspace as release evidence for both variants. AIT currently has one root package, with `pnpm test` and `pnpm typecheck` in `package.json` and the full unit suite in `.github/workflows/ci.yml`. Add the paired flag matrix and preview crawl evidence in the implementation PRs. Local work runs only touched or new test files and the affected workspace type-check.
- Run `node scripts/check-i18n-parity.mjs` for each rollout PR. Exercise representative pages in English, Dutch and French. Record expected feature additions in the on/off matrix and show all existing behavior accounted for.
- Before production is enabled, require every item's blind decision and parity evidence at the integrated revision. Compare routes documented above and all new routes, plus the existing non-localized endpoints affected by the work. Confirm the last off build can still serve data produced by the on build.

## Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Access rules drift between navigation, index, tools and data exports | Apply the ADR-0050 runtime and SQL checks plus surface-specific access. Test a logged-out request, two tenants, removed users, and assets reached without the page. |
| Legacy reads break when new models write records | Keep optional fields and source IDs, version serialized contracts, and test the off build with data produced by the on build. |
| A frame change disrupts workspace focus or mobile overlays | Reuse layout variants and one overlay graph, and verify focus, scrolling, mobile IME and Night at the shell gate. |
| Import publishes private data or triggers unwanted messages | Stage validation and media, publish to a restricted fresh target, suppress ordinary side effects and require explicit follow-up for access or publication changes. |
| Signed delivery or an archive job stalls during rollout | Use durable work records, bounded retries, expiry and visible failure codes. Pause gated workers on rollback and resume by existing IDs. |
| Large tenants load too much navigation, search or export data | Batch counts, cap and page reads, stream artifacts and measure a large synthetic tenant before enabling the release. |

Product owner decisions:

1. Confirm the free community's default join policy and which initial per-account and media limits are appropriate. The proposal uses an unlisted, invite-only community with a working ordinary member invite and no paywall.
2. Confirm whether the first discussion rollout should promote selected legacy forum threads through links or add a later migration of source records. This spec keeps the forum available and preserves its IDs and workflows.
3. Confirm the builder scope and initial quota defaults, including who may issue or manage credentials and whether any member data is needed beyond the initial webhook's opaque references.
4. Confirm the export rules for roster contact fields, historical attribution, media that providers cannot package, and the proposed seven-day retention. Preserve attendee-answer isolation and participant-only messaging in either case.
5. Confirm the release owner, canary cohort and rollback window before flag removal.
