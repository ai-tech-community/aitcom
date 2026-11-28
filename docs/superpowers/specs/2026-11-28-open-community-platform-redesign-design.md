# Open community platform redesign

Draft 2026-11-28. Project.

## Intent

Give each community a home that members can navigate without relearning it on every page. One sidebar holds its spaces, one feed starts the conversation, and posting, chat and event registration stay close to the content. Organizers use the same frame to manage the community. Circle supplies the comparison for how people find and use these tools. AIT uses its own design system and keeps its existing capabilities.

## Scope constraint — UI only

Every item restyles or restructures existing screens using their current components, routes and data paths. The redesign adds no tables, migrations, tRPC procedures, REST routes, page routes, MCP tools, webhook topics, defaults, policies or permission changes. Existing handlers, jobs, data contracts and side effects apply in both UI variants. Any design that needs an unavailable capability belongs under [Out of scope — filed separately](#out-of-scope--filed-separately).

## Goals

- **Free to start.** Make the existing Create community dialog easy to find and complete. `src/components/communities/create-community-dialog.tsx` submits to `communities.create` in `src/server/api/routers/communities.ts`, which creates a live community, makes the signed-in creator its active owner and seeds the usual spaces without checkout. The existing invite settings are the next step for sharing an invitation. See item 12.
- **Open to builders.** Make Agent Profile and Connect easy to find, with clear paths to the existing agent key, MCP, webhook setup and guides. `src/app/[locale]/dashboard/(agent)/agent/content.tsx` renders those tabs, `src/app/api/mcp/route.ts` serves MCP, and `src/server/api/routers/agent-management.ts` handles keys and webhook setup. See item 13 for the setup and community integrations surfaces.
- **Open between communities.** Give the same Hub account a visible route from the switcher to Discover and back to a joined community. `src/server/better-auth/hub-session-server.ts` supplies the signed-in membership seed, `src/server/communities/my-communities.ts` backs My communities, and `src/components/communities/communities-directory.tsx` and `src/components/communities/use-community-join.ts` supply discovery and join. Directory listing, content visibility and member identity follow ADR-0050 and ADR-0021.
- **Your data is yours.** Make existing downloads easy to find and explain what each covers. Active community owners can export payments through `src/app/api/payments/export/route.ts`. Event organizers and collector run owners have their own downloads at `src/app/api/events/[slug]/attendees.csv/route.ts` and `src/app/api/collectors/runs/[runId]/export/route.ts`. Item 14 inventories these and the existing public benchmark export.
- Preserve every route and supported workflow in the inventory. Ship in 15 PRs behind one UI flag, with the shell first.

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
- Keep the Hub anchor, local roles and Hub-global XP. Reuse Better Auth, next-intl, tRPC guards and the existing Payload and app data paths.
- Use the [demo community](2026-11-28-redesign-demo-content.json), [reference capture checklist](2026-11-28-circle-reference-capture.md) and [UI frame ADR](../../adr/0052-redesign-is-a-ui-frame-over-existing-routes.md).

## Approaches considered

1. **One frame around the existing routes** (chosen). Preserve URLs, providers and domain components. Ship the frame first, then replace individual surfaces behind the same flag.
2. **A new URL subtree and second application shell.** It would require parallel links, caches and visibility checks for the same content and would make the route parity contract harder to maintain.
3. **Replace the old shell in place in the first PR.** This would change production navigation before the downstream surfaces had proved parity and remove the rollback path.

## Decisions

### Shell anatomy

- **Layout and providers.** `src/app/[locale]/layout.tsx` remains the document boundary and owns locale, tRPC, Better Auth session, rules, inbox, space windows, toasts and the single main landmark. Extend the path-based chrome policy in `src/components/site-chrome-gate.tsx` so a standard community route has one header. Keep the server query prefetch and user/membership seed in `src/app/[locale]/communities/[slug]/layout.tsx` and the outsider gate, join deep link and child slots in its `_community-layout-client.tsx`. Share server and client data paths between shells.
- **Desktop sidebar.** From the existing `lg` breakpoint, put the community identity and switcher first, then Home, visible built-in spaces, rooms and the existing role-gated links in their current sections and order. Give the existing Forum destination a clear row wherever the built-in space is shown. Reuse `src/components/communities/community-identity.tsx` for identity and join controls. Use the localized labels, positions, archived state and access-filtered rows from `src/components/communities/community-nav.tsx`, `src/server/api/routers/spaces.ts` and `src/server/communities/space-defaults.ts`. Preserve the lock and request path for a visible room that requires approval, show the active destination on detail URLs, and keep sidebar scroll separate from content.
- **Switcher.** Open a searchable list of the signed-in user's active, usable memberships from `src/server/better-auth/hub-session-server.ts` and `src/server/communities/my-communities.ts`. Pin a distinct Hub entry and offer Discover and My communities. Pending, banned and lapsed memberships cannot appear as usable spaces. Pending requests can still be managed from the existing account surfaces. Switch to the target community's Home in the same locale, with its theme and role recalculated before showing any scoped rows or counts. Guests get Hub and Discover links.
- **Unread state.** Reuse room read markers and the authorized counts already returned by the room queries and `src/server/communities/room-unread.ts`. Show those counts and the existing DM and notification badges with accessible labels. Use the existing read transitions and omit badges when the underlying count is unavailable or access has lapsed.
- **Header and search.** One compact header identifies the active page and offers Find a page, notifications, inbox and account/language. Keep Join near the community identity for eligible outsiders. Use `src/components/navbar.tsx`, `src/components/site-nav.ts`, `src/components/notifications/notification-bell.tsx` and `src/components/inbox/messages-nav-link.tsx` as the existing entry points. Use `src/components/ui/command.tsx` to filter visible navigation links already loaded in the frame. Item 8 keeps existing search reachable from its current surfaces. The header and mobile entry open the same controls.
- **Mobile.** Below `lg` use a top bar and a bottom bar with Home, Spaces, Messages and More. Spaces opens a drawer with the same switcher, ordered space links, unread and Manage links. More exposes Hub destinations and account shortcuts. Restore focus on close, announce the active destination, respect safe areas and the on-screen keyboard, and close the drawer after navigation. Drawers and compose controls share the existing overlay providers. Keep a single scroll context for the page and use the existing mobile inbox presentation.
- **Theme and full-screen views.** Put the standard community header, sidebar and page inside one `src/components/communities/theme/community-theme-scope.tsx` and reuse `community-theme-preview.tsx` and `community-theme-cover.tsx` in that directory. Prefetch the theme before render. A saved banner wins over catalog art. Keep `src/components/ui/portal-container.tsx` for frame-owned overlays and the ADR-0051 behavior of root overlays. Use `src/lib/communities/layout-variant.ts` to preserve plain full-screen event editors, the course builder and the issue builder. Preserve the independent `src/components/magazines/reading/magazine-shell.tsx` with its own community return link. Keep the settings, event manage, hackathon, member profile and dashboard layouts in charge of their existing permissions and inner navigation.
- **Hub and account destinations.** The same header language and primitives support a Hub view. Its navigation exposes Discover, Events, Magazines, Launchpad, Jobs, News and Investigations without selecting a tenant. Public directories and detail pages keep their URLs, canonical metadata, and local widths. The Hub view links into community pages where there is a permitted local counterpart. Dashboard, payments, onboarding and the agent workspace sit under Account with their existing route-group frames. Full-page Messages and Notifications are account-wide. Leaving a tenant for a Hub, auth or account page drops tenant styling and context. The public home, legal pages, share images and magazine reading retain their existing page-specific formats.

### Rollout flag

Use `NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES`. Follow the validated boolean-string pattern in `src/env.js` and the shared reader pattern in `src/lib/chat/flags.ts`. Define one reader in `src/lib/communities/redesign-flag.ts`, default `"false"`. Resolve the same value for the locale and community layouts and pass it to client chrome and page variants. The flag only selects what renders. The existing chat and payments flags continue to govern their respective capabilities.

`NEXT_PUBLIC_` is compiled into the client bundle. Build and deploy server and client artifacts with the same value. Roll back by deploying a matching off build. The flag is deployment-wide. Production stays off while flagged previews exercise completed slices. Both variants share URLs, auth, permissions, queries, mutations, endpoints, tools and jobs. Incomplete surfaces keep their existing render inside the new frame.

Once all 15 items pass the release gate, deploy on, check the canaries and record the rollback window. Remove legacy render branches, the flag reads and its env declaration after that window.

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

Items 12–14 own UI within existing routes. Item 12 owns the creation dialog wherever it opens. Item 13 owns builder controls and guides on the existing agent, setup, guide and integrations pages. Item 14 owns export controls on the existing payment, event and collector screens. The route owners in the table coordinate the shared page layout, links and parity checks.

Layouts and loading states inherit their route's owner. Item 1 owns the localized root layout and not-found page. Item 10 owns shared dashboard frames, item 9 owns the auth and onboarding layouts, and item 15 owns the agent, collectors, magazine issue, insights, rituals and investigation layouts. Item 5 owns event manage and event detail layouts, and item 7 owns the profile layout. In the crawl, exercise the event, job and profile loading states as part of their owning routes.

### Item 1 — Shell and navigation

- **Scope and routes.** Deliver the shared chrome, sidebar, switcher, theme and mobile behavior above. Own the locale frame, community frame and the item 1 inventory paths. Keep the child pages in their current slots.
- **Reuse and data.** Use the prefetch, frame, space and role seams above. Render built-in spaces and rooms using their existing order and sections. Item 10 owns the existing Spaces settings screen.
- **Reference and acceptance.** The blind critic picks AIT over Circle's Home sidebar, header and switcher for finding a space and moving between communities with context intact. The parity gate passes, including keyboard and mobile navigation, a private outsider, Plain and Night, and full-screen workspace transitions.

### Item 2 — Community home feed and composer

- **Scope and routes.** Own `C`. One stream, with pinned content and topic filters above it. Open the existing editor in place with the community feed as the destination, an unsent draft state and a clear retry. Keep About, curated links, welcome checklist, real activity, reels and news entry points as secondary content.
- **Reuse and data.** Keep `src/components/communities/feed/feed-page.tsx`, `post-composer.tsx`, `editor/post-editor.tsx`, `feed-post-card.tsx` and `community-sidebar.tsx` in that directory. Reuse `src/server/api/routers/feed.ts` and `src/collections/FeedPosts.ts` for policy, pins, polls, mentions, GIF, images, video, reporting, likes and comments. No new store.
- **Reference and acceptance.** The blind critic picks AIT over Circle Feed for scanning, starting a draft and publishing with a clear destination. The parity gate passes for media, replies, moderation, draft recovery, topic filters, and posting as a member or a read-only visitor.

### Item 3 — Feed discussions and forum entry

- **Scope and routes.** Own the presentation of posts and comments in the community feed and the forum routes, legacy board and aliases in the inventory. Keep the forum as it is inside the new frame, with a clear sidebar entry to `C/forum` where the existing space is visible. Preserve its list, thread detail, composition and moderation screens and keep ritual and greeter source links working. The feed remains the discussion home under ADR-0026.
- **Reuse and data.** Restyle the existing `src/components/communities/feed/feed-post-card.tsx` and `src/components/communities/feed/feed-comments.tsx` surfaces. Render `src/components/forum/forum-page.tsx` and `src/components/forum/community-thread-detail.tsx` through their current routes, `src/server/api/routers/forum.ts` and `src/server/communities/forum-write-access.ts`. Preserve rules, pins, locks, replies and moderator actions on the same records and URLs.
- **Reference and acceptance.** The blind critic picks AIT over the equivalent Circle tasks for locating, reading and replying to a discussion. The parity gate passes for existing feed links, forum and thread deep links, legacy redirects, creation, moderation, permissions and draft approval.

### Item 4 — Chat and direct messages

- **Scope and routes.** Own the room/lobby screen at `C/spaces/[spaceSlug]`, `/messages`, `/messages/[conversationId]` and the parallel space windows. Improve reading and composing in the existing room timeline and inbox. Keep join/request/leave access states, direct and owner–agent conversations, rich messages, unread and reconnect.
- **Reuse and data.** Use `src/components/communities/rooms/room-view.tsx`, `src/components/communities/explore/space-window-provider.tsx`, `src/components/inbox/inbox-provider.tsx`, `src/components/inbox/message-composer.tsx` and `src/server/api/routers/inbox.ts`. Keep ADR-0025 SSE at `src/app/api/inbox/stream/route.ts`, Upstash publish in `src/server/inbox/publish.ts`, optimistic sends and the foreground fallback in `src/components/inbox/use-inbox-stream.ts` and `live-refetch.ts` in that directory. Preserve the existing subscription and read behavior.
- **Reference and acceptance.** The blind critic picks AIT over Circle chat and DMs for sending, reading and resuming a conversation. The parity gate passes for access revocation, duplicate delivery, reconnect, room requests and DM deep links.

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

- **Scope and routes.** Own `D/notifications`, `/unsubscribe` and the header bell. Keep mark read, preferences, digest opt-out, moderation notices and introduction consent. Make existing search controls easy to reach, including the Forum search and the community directory filter. The header page finder from item 1 filters visible navigation links.
- **Reuse and data.** Use `src/components/notifications/notification-panel.tsx`, `src/components/notifications/notification-prefs.tsx` and `src/server/api/routers/notifications.ts`. Reuse the existing search UI and queries in `src/components/forum/forum-page.tsx` and `src/components/communities/communities-directory.tsx` for their respective results and empty states.
- **Reference and acceptance.** The blind critic picks AIT over the equivalent Circle tasks for finding a destination or a forum result and clearing a notice without losing place. The parity gate passes for preferences, opt-out, and results and notifications subject to existing visibility rules.

### Item 9 — Join and onboarding

- **Scope and routes.** Own auth, join, invitation, onboarding and account payments routes in the inventory. Own paid join inside item 15's offer routes and join prompts inside the shell. Cover verification, sign-in and recovery with return destination, open join, invitation, approval request, private landing, offer checkout and first-week onboarding.
- **Reuse and data.** Use `src/app/[locale]/auth/signup/signup-form.tsx`, `src/components/communities/join-button.tsx`, `src/components/communities/use-community-join.ts`, `src/server/communities/invite-policy.ts`, `src/server/communities/activate-membership.ts`, `src/components/communities/onboarding/welcome-checklist.tsx`, `src/components/communities/payments/offer-purchase-view.tsx` and `src/server/payments/access.ts`. No schema change.
- **Reference and acceptance.** The blind critic picks AIT over Circle sign-up, invite acceptance, onboarding and paywall for clarity from first click to useful content. The parity gate passes for existing accounts, membership states, expiry, approval, role-bearing invites and checkout return/failure.

### Item 10 — Admin and settings

- **Scope and routes.** Own every existing `C/settings` page or redirect, `D` and `D/settings`. Keep reachability of account preferences and organizer actions, including broadcasts, themes, integrations, roles, rules and ownership. Keep the current Surfaces and Rooms controls in Spaces and magazine-specific settings in the editorial desk. Coordinate the existing integrations and payments screens with items 13 and 14.
- **Reuse and data.** Use `src/components/communities/settings/settings-sidebar.tsx`, `compose-spaces.tsx`, `members-settings.tsx` and `theme-settings.tsx` there, plus `src/server/api/routers/communities.ts`, `src/server/api/routers/spaces.ts` and `src/components/dashboard/member-dashboard-frame.tsx`. Keep current ordering and visibility controls and the existing owner, admin and moderator gates per action.
- **Reference and acceptance.** The blind critic picks AIT over Circle Settings, Spaces and Audience for locating and safely operating a setting. The parity gate passes for every settings page, including hidden/archived spaces, member management, theme preview and owner-only controls.

### Item 11 — Discovery between communities

- **Scope and routes.** Own `/`, `/communities`, `/discover` and `D/communities`. Keep `/discover` resolving to the canonical discovery page at `/communities`. Preserve existing facets, featured/recommended results, Explore and rooms. Provide visible paths from Hub and the switcher to browse, join and return.
- **Reuse and data.** Use `src/components/home/home-sections.tsx`, `src/components/communities/communities-directory.tsx`, `src/components/dashboard/my-communities/my-communities.tsx`, `src/server/communities/directory.ts`, `src/server/communities/discovery-queries.ts`, `src/server/communities/content-visibility-queries.ts` and `src/app/sitemap.ts`. Listed private communities retain their ADR-0050 public front door, with interior pages and activity gated. Preserve existing canonical metadata, sitemap inclusion, noindex and cache behavior.
- **Reference and acceptance.** The blind critic picks AIT over Skool Discovery for understanding an unfamiliar community, choosing one and returning under the same account. Record Circle Discover and the switcher as context, using the capture checklist. The parity gate passes for discoverable listed-private front doors, hidden and unlisted data, canonical locale URLs and account continuity.

### Item 12 — Free self-serve creation

- **Scope and routes.** Restyle the Create community dialog on `/communities` and make its existing `?create=1` entry and sign-in continuation clear. Keep the name, optional description, join policy and listing controls. The dialog starts with Open and Listed selected. On success it opens the created community. Make the next step to an existing space or Settings → Invites easy to see in the new frame.
- **Reuse and data.** Keep `src/components/communities/create-community-dialog.tsx`, `src/components/communities/use-create-community-deep-link.ts` and `communities.create` in `src/server/api/routers/communities.ts` for submission, errors, owner membership and navigation. `src/server/communities/seed-default-spaces.ts` supplies the current built-in spaces. Use the existing invite creation and copy controls in `src/components/communities/settings/invites-settings.tsx` on `C/settings/invites`.
- **Reference and acceptance.** The blind critic picks AIT over Circle for finding Create, completing setup and sharing an invite through the current flow. The parity gate covers sign-in and return, current defaults and options, name conflict, success navigation, owner access and the existing invite flow.

### Item 13 — Builder access

- **Scope and routes.** Restyle the current builder setup on `D/agent`, `/setup`, the existing guide pages and `C/settings/integrations`. Make Profile, Connect and their guides easy to find. Show the existing key controls, connection instructions, webhook setup and status where the user already manages their agent. Keep community Luma integration controls in Settings → Integrations.
- **Agent keys and MCP.** `src/app/[locale]/dashboard/(agent)/agent/content.tsx` renders the tabs and `src/components/agent-quick-start.tsx` for initial setup. Profile uses `src/components/agent/profile-tab.tsx` and `src/components/agent-api-key.tsx`; generation and revocation use `src/server/api/routers/agent-management.ts`, with key validation in `src/server/agent/api-key.ts`. Connect uses `src/components/agent/connect-tab.tsx` and its client-specific setup components. Preserve `/api/mcp`, its registration and tool authorization through `src/app/api/mcp/route.ts`, `src/app/api/mcp/server.ts`, `src/server/mcp/catalog.ts` and `src/server/api/trpc.ts`.
- **Agent webhooks.** Connect renders `src/components/agent/setup-webhook.tsx` for existing setup, test delivery, status, and proposed-hook approval. The current agent webhook implementation lives in `src/server/api/routers/agent-management.ts`, `src/app/api/agent/webhook/route.ts`, `src/app/api/mcp/webhook-tools.ts` and `src/server/agent/deliver-event.ts`. Keep the existing owner and agent permissions and human approval for drafts.
- **Community integrations and guides.** `src/app/[locale]/communities/[slug]/settings/integrations/page.tsx` renders `src/components/communities/settings/integrations-settings.tsx` for Luma using `src/server/api/routers/luma.ts`. Keep links to the setup guide in `src/app/[locale]/setup/page.tsx` and the webhook guide in `docs/agents/realtime-webhooks.md`. The other guide sources are `src/app/[locale]/guides/agent-ready-community/page.tsx`, `src/app/[locale]/guides/mcp-registry-vs-community-hub/page.tsx` and `src/app/[locale]/guides/register-agent-mcp/page.tsx`.
- **Reference and acceptance.** The blind critic compares finding and using a credential, connecting an MCP client and configuring a webhook with Circle's corresponding setup tasks. The parity gate covers key generation and revocation, existing tool access, webhook setup and test feedback, the agent catalog and approval paths, and Luma controls at their current permissions.

### Item 14 — Existing exports

- **Scope and routes.** Make existing export actions and their formats easy to recognize on their current screens. Keep the data coverage, eligible users, filters, formats and download behavior of each action.

| Existing export | Current entry and implementation |
| --- | --- |
| Community payments CSV for active owners | Settings → Payments (`C/settings/payments`) renders `src/components/communities/payments/payments-settings.tsx` and `src/components/communities/payments/payments-view.tsx`. The download is served by `src/app/api/payments/export/route.ts`. The sample download in `src/components/communities/payments/payments-preview.tsx` remains part of the preview. |
| Event attendee CSV for organizers | `C/events/[eventSlug]/attendees` renders `src/components/events/organizer-attendee-list.tsx`. Its download uses the selected view, source, search and locale in `src/app/api/events/[slug]/attendees.csv/route.ts`, with serialization in `src/server/events/attendee-csv.ts`. |
| Collector run CSV and JSON for the run owner | `D/collectors/runs/[runId]` renders `src/components/collectors/collector-run.tsx`. Downloads use `src/app/api/collectors/runs/[runId]/export/route.ts`, `src/server/collectors/runs.ts` and `src/server/collectors/export/formats.ts`. |
| Public benchmark brand CSV | The discovery response in `src/app/api/benchmark/public/route.ts` lists `src/app/api/benchmark/export/brand/[slug]/route.ts`. It has no current screen control. Keep its existing API access. |
| Event calendar file | The event share row in `src/components/event-share-row.tsx` links to `src/app/api/events/[slug]/ics/route.ts`. Preserve Add to calendar in item 5. |
| Agent n8n workflow JSON | Download the existing setup template in `src/components/agent-quick-start.tsx` and `src/components/agent/setup-n8n.tsx`. Preserve the download in item 13. |

- **Related file actions.** Item 6 preserves lesson material downloads from `src/components/classroom/materials/hosted-file-card.tsx` through `fileLink` in `src/server/api/routers/classroom-materials.ts`.
- **Reference and acceptance.** The blind critic picks AIT over the corresponding Circle task for finding, running and understanding an existing export. Check each existing file action in parity, including owner and organizer access, attendee filters, both collector formats, current endpoints and existing exclusions.

### Item 15 — AIT extras in the shell

- **Scope and routes.** Own all item 15 inventory paths. Use standard tenant chrome for gallery, launchpad, ideas, match, offers, reels, rituals, referrals, insights and the magazine desk. Hub extras use Hub navigation. Keep independent magazine reading and editor frames. Preserve every author/review flow, public share route, empty state, access gate and return link. Keep jobs, collectors and agent tools reachable from account surfaces.
- **Reuse and data.** Use `src/components/magazines/community/magazine-tab.tsx`, `src/components/magazines/editor/builder/issue-builder.tsx`, `src/server/magazines/issue-access.ts`, `src/components/communities/gallery/gallery-page.tsx`, `src/components/launchpad/launchpad-listing.tsx`, `src/server/api/routers/ideas-filter.ts`, `src/components/communities/matching/find-a-match.tsx`, `src/components/communities/payments/community-offers.tsx`, `src/components/communities/reels/reels-viewer.tsx`, `src/components/communities/rituals/rituals-manager.tsx`, `src/components/communities/referral/referral-panel.tsx` and `src/components/communities/insights/insights-dashboard.tsx`.
- **More reuse.** Keep `src/components/investigations/startups-jobs-page.tsx`, `src/components/news/news-table-browser.tsx`, `src/server/api/routers/articles.ts`, `src/app/[locale]/dashboard/(agent)/agent/content.tsx`, `src/components/investigations/awesome-ai-oss-page.tsx` and the corresponding existing pages in the inventory. No schema change.
- **Reference and acceptance.** The blind critic picks AIT for craft against the chosen polished Circle spaces, scoring hierarchy, rhythm, empty/error states and fit with items 1–3. The parity gate passes for all item 15 routes and roles, including private media/gallery moderation, magazine editorial permissions, agent claim, collector access and return from an editorial workspace.

## Out of scope — filed separately

- Custom space groups and group editing. Today's navigation has built-in spaces, rooms and role-gated links in their existing sections.
- A discussion space type, space-linked feed posts, a feed post title field and detail route, discussion read cursors, and moving forum records into the feed. The forum stays available at its existing links.
- Threaded room replies. Current rooms use a chronological timeline.
- Unified Community/Hub content search. Current searches belong to individual surfaces such as Forum and the community directory.
- A dedicated community creation route, automatic Welcome room and invite creation, and resumable or idempotent setup. The current create dialog seeds the existing built-in spaces and invites are created in Settings.
- A general tenant REST API with community-issued credentials, community webhook subscriptions and delivery history, or additional MCP tools and grants. The current builder controls are agent-scoped, with community Luma setup in Integrations.
- A single export of the entire community roster, content, settings and owned media, and importing or restoring that archive. There is no full community export or restore flow today. The current file actions are listed in item 14.

## Slices

1. Item 1 is the first PR to land. Items 12, 13 and 14 can develop in parallel in their current UI components. Each is a separate PR and can use the shell's settings and navigation slots when it lands.
2. Items 2–11 and 15 follow the shell. Items 2 and 3 coordinate feed presentation and verify the sidebar's forum entry. Items 5, 10 and 15 coordinate existing event, settings and account surfaces with items 13 and 14. Item 15 checks complete navigation with the new frame in place.
3. Review each item in a flagged preview. Record its critic result and parity evidence on its own PR. Keep production off until the end-to-end gate passes. Flag removal follows stable release, through the cleanup described above.

## Verification

### Blind critic

Use the [capture checklist](2026-11-28-circle-reference-capture.md) and one shared content fixture. Give the critic shuffled pairs and equivalent starting roles, viewport and content. Conceal product labels in the review packet where possible, preserve the original captures and record when product identity is apparent. Score completion, clarity, steps/recovery and craft using the task set for the item. Every item needs an explicit AIT preference. A tie or a preference for the reference needs another iteration. Record the evidence and any reference capability blocked by a plan or unavailable in the browser.

### Parity gate

- Build paired flag-on and flag-off previews from the same revision. Match the route inventory against the source tree, then crawl every inventoried page and localized share endpoint in both variants. Expand dynamic routes with representative IDs and cover query states, legacy aliases, redirect targets, 404s and noindex. Include signed out, public outsider, private outsider, invited, pending, active member, lapsed, moderator, admin, owner, and the applicable editor, organizer and judge roles. Use direct navigation and reload to test deep links. Compare status, destination, accessible actions and record identity. Check for missing commands, private-data leaks, duplicate chrome and broken translations. Record any existing access exception that is specific to a surface, including magazine teasers.
- Exercise important writes and state transitions on an isolated test fixture. Keep CI's full suite and type-check for every touched workspace as release evidence for both variants. AIT currently has one root package, with `pnpm test` and `pnpm typecheck` in `package.json` and the full unit suite in `.github/workflows/ci.yml`. Add the paired flag matrix and preview crawl evidence in the implementation PRs. Local work runs only touched or new test files and the affected workspace type-check.
- Run `node scripts/check-i18n-parity.mjs` for each rollout PR. Exercise representative pages in English, Dutch and French. Record the presentation differences in the on/off matrix and show all existing behavior accounted for.
- Before production is enabled, require every item's blind decision and parity evidence at the integrated revision. Compare the routes above and the existing non-localized endpoints used by the redesigned screens. Verify that a user can return to the same record or workflow after switching builds.

## Risks and open questions

| Risk | Mitigation |
| --- | --- |
| The new frame shows a link or badge to the wrong viewer | Render from the existing authorized data and gates. Verify signed-out access, two communities, removed users and direct URLs. |
| Entry points for forum, builder setup or downloads are hard to find | Verify them from shell, settings and account navigation as the applicable member, owner or organizer. Keep their existing direct entry points in the parity crawl. |
| A frame change disrupts workspace focus or mobile overlays | Reuse layout variants and one overlay graph, and verify focus, scrolling, mobile IME and Night at the shell gate. |
| The frame increases page load time in a large community | Reuse the existing navigation and counts queries. Measure desktop and mobile rendering with a large synthetic community before release. |

## Product owner decisions

- The redesign is UI only. Creation, builder access and downloads use their existing behavior and settings.
- Keep the forum as it is and link to it from the new shell.
- The release owner, canary cohort and rollback window are still to be confirmed before production rollout.
