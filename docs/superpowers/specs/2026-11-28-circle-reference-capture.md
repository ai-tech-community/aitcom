# Circle reference capture

Draft 2026-11-28. Companion to the [redesign spec](2026-11-28-open-community-platform-redesign-design.md).

## Intent

Capture equivalent starting states and outcomes for a blind comparison. Use screenshots for layout, recordings for tasks, and task logs for the existing creation, builder and export flows.

## Setup

- Use [Workbench Notes](2026-11-28-redesign-demo-content.json) in the Circle trial and the isolated AIT test database. Copy names, text, ordering, roles, dates and RSVP data unchanged. Use synthetic test accounts. Map Paper Kite to owner, River Reed to admin, Copper Fern to moderator and the other nine to members. If the reference has separate admin and space moderator roles, assign the narrow equivalent. No private account data goes into the review packet.
- In Circle, create the two named space groups and the six ordered spaces. Use three post spaces, one chat space, one event space and one course space. The course space title and course title may share one field. Keep the fixture's course title visible and use its Course label in navigation where independently configurable. Map the two modules to sections and the DMs to two-person conversations. Give the member viewer access to at least the three post spaces so the Circle Feed is populated. For AIT, use the existing ordered built-in and room sections, the feed and forum for discussion, and the room timeline for chat. Map native records to fixture IDs. [Circle Feed](https://help.circle.so/p/basics/home/home-overview)
- Start member views as Folding Rule, unless a row names a different viewer. Use River Reed for admin views and Paper Kite for owner-only setup. Make the same unread mention using another fixture account, and mark the same first lesson complete for course resume. Use a second empty synthetic community called Workbench Sandbox on both systems for membership and isolation checks. Run item 12 in a fresh scenario with that name available. Keep temporary mutations, including restricted-access and checkout drills, in resettable scenarios seeded from the fixture.
- Set English, browser zoom 100%, and timezone Europe/Amsterdam. Capture with the event dates still upcoming, using the fixture's reference date where the environment permits. If a provider uses its own clock, capture during the shared upcoming date window or record the temporal difference. Keep sample query, scroll position, selected space, pending/draft state and browser chrome consistent within each pair.
- Capture **1440x900 and 390x844** CSS-pixel browser viewports for every row. Use desktop and mobile web. Capture light and dark where Circle exposes the theme in the browser for that state. Use AIT Plain and Night for scoped community pairs, and the actual available setting for Hub, auth, portal or full-screen workspace views. Record unavailable themes or surfaces in the run log. [Circle browser theme controls](https://help.circle.so/c/core-features/how-can-i-customize-my-community-theme)
- Put Circle screenshots at `.gauntlet/reference/circle/<item-slug>/<screen>-<viewport>-<theme>.png` and AIT screenshots at `.gauntlet/ours/<item-slug>/<screen>-<viewport>-<theme>.png`. Use the screen IDs below and literal `1440x900`, `390x844`, `light`, `dark`. If one side only renders light, capture that honestly and record the missing pair. Record the required flows at both viewports in light by default using `<flow>-<viewport>-light.mp4` in the same item directories. Put Skool references at `.gauntlet/reference/skool/` using the same suffix convention.
- Use the provider UI's visible control for each named state. Record actual path, date, browser, trial or plan, actor, theme, and whether a screen is gated, absent or verified from docs. Capture the gate when access is denied. Use a plan-authorized test environment for a like-for-like run when available. Where the product has no corresponding operation, record its closest supported workflow and the endpoint reached. Keep original evidence, remove secrets and test emails from packets, and shuffle product ordering for the critic.
- In the tables, `C` means `/communities/workbench-notes` and `D` means `/dashboard` on AIT. Resolve IDs through the fixture map. AIT captures use the flagged preview.

## Visual items

### 01-shell-navigation

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `home-expanded` | Member | Home → Feed. On mobile web open the sidebar. Show both groups expanded, the active Home and Show your work with its unread cue. | Open `C`. On mobile open Spaces. Show the current space sections and order, active Home, chat unread and header entries. |
| `space-active` | Member | Open General discussion. On mobile reopen the sidebar after navigation. | Open Forum from the sidebar and show its active state on `C/forum` and a thread detail URL. |
| `switcher-open` | Member | Open the community switcher with Workbench Notes and Workbench Sandbox visible. | Open the switcher with both test memberships and the Hub entry. |
| `manage-entry` | Admin | Open the community name menu with the admin entry visible. | Open the community identity or mobile drawer and show Manage and Settings. Capture space controls in item 10. |
| `restricted-landing` | Visitor | Open the fixture's private community URL in a signed-out session. | Open `C` configured invite-only, signed out. Capture identity and entry control with scoped navigation suppressed. |

Open an unread space, switch to Sandbox and back, and open Settings with the keyboard. On phones record drawer open, navigation and focus return. [Circle desktop navigation](https://help.circle.so/p/basics/getting-started/navigating-circle-on-desktop) · [Circle community switcher](https://help.circle.so/p/basics/customization/get-to-know-the-community-switcher)

### 02-home-feed-composer

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `feed-latest` | Member | Home → Feed. Set sorting to Latest and show the first viewport. | Open `C` at the newest community posts, with pinned context visible. |
| `composer-empty` | Member | Start from Feed and open its post action if available. Otherwise choose General discussion → New post. | Start from `C` and open the inline composer for the community feed. |
| `composer-draft` | Member | Enter the shared draft below, choose General discussion and show the selected destination and publish control. | Enter the same draft and capture its in-place editor state. |
| `post-published` | Member | Return to the Feed or the post space view with the new post fully visible. Record any extra navigation needed. | Show the published post in `C` with destination and confirmation visible. |
| `announcement-controls` | Admin | Open the post menu on December open bench in Announcements and show the pin and edit controls. | Open the same post menu from the community feed and show pin/edit controls. |

**Record `composer`.** From the feed, create **A quick hinge check** with body “I marked the point where the hinge shifts. I will try tightening it and measure the gap again.” Use General discussion in Circle and the community feed in AIT. Publish, locate the result and return to the feed. Save the unsent-draft recovery state separately if supported. [Circle post workflow](https://help.circle.so/p/members/additional-resources/creating-and-managing-posts-as-a-member)

### 03-feed-discussions-forum

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `discussion-list` | Member | Open General discussion with its List layout from Home and show the most recent posts. | Open `C/forum` from the sidebar and show the existing list. |
| `post-comments` | Member | Open A drawer that catches, scroll to its three replies, and focus the comment composer. | Find the mapped post on `C`, open its existing comments and focus the composer. |
| `moderation-menu` | Admin | Open the detail's More actions menu and show available moderation and pin controls. | Open the corresponding feed post's existing moderation menu. |
| `forum-thread` | Admin | Capture a pinned post with comments available to the admin in General discussion. | Follow an existing fixture deep link to `C/forum/[threadSlug]` and show replies and role-appropriate pin/lock controls. |

Record opening from the list, posting a reply and going back. Verify direct links to the AIT thread and its legacy redirects in parity. [Circle post-space settings](https://help.circle.so/p/posts/post-spaces/customize-post-space-settings)

### 04-chat-direct-messages

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `room-unread` | Member | In Home, capture unread Show your work, then open the chat space at its unread boundary. | Open `C/spaces/show-your-work` from the unread row. |
| `room-timeline` | Member | Open Show your work and show its recent messages and composer. | Open Show your work and show the same messages in the current room timeline. |
| `dm-open` | Member, Chalk Boat | Open header Direct Messages → Soft Pencil. Show Photo review and its message composer. | Open the mapped conversation under `/messages/[conversationId]` and show the same message history. |
| `room-admin-menu` | Admin | From Show your work, show the available moderation or membership controls. | Open the corresponding role-appropriate room moderation or membership controls. Record any difference in available actions. |

**Record `chat-send`.** Open Show your work, send “I checked the gap with a strip of paper.” and show it once in a second session. Open the Photo review DM as Chalk Boat and send “I can look at the matching photo this evening.” Record pending, received and reconnect behavior where reproducible, with the same network conditions on both sides.

### 05-events

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `event-list` | Member | Home → Events space, Upcoming, with the three fixture events visible in order. | Open `C/events` with the same upcoming events. |
| `event-before-rsvp` | Member | Open Repair notes review, with date, location and RSVP control visible. | Open its canonical `/events/[slug]` before registration. |
| `event-after-rsvp` | Member | RSVP and capture Going and the calendar control. | Show confirmed registration and the calendar action. |
| `public-event` | Visitor | Open the same event detail signed out if its space is public. On a trial that blocks public setup, capture the access gate. | Open the canonical link signed out for a listed, open community. |
| `event-editor` | Admin | Admin → Events → Repair notes review → Edit event, with date and location controls shown. | Open `C/events/[eventSlug]/edit` for the same event. |
| `event-attendees` | Admin or event host | From the edit screen open People with the seeded attendees and Going status. | Open `C/events/[eventSlug]/attendees` with the same roster. |

**Record `rsvp`.** Start from the calendar, open Repair notes review and RSVP as Folding Rule. Confirm the outcome and calendar link, then return to the list. Capture AIT's registration questions, check-in and hackathon workflows separately for parity. [Circle RSVP](https://help.circle.so/p/members/live-and-events/rsvp-and-attend-community-events) · [Circle attendee management](https://help.circle.so/p/live-and-events/events/add-members-to-an-event) · [Circle trial public access](https://help.circle.so/p/basics/community-access/set-up-a-public-community)

### 06-classroom

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `classroom-directory` | Member | Open Courses from the header and show the tile for Document a small repair. | Open `C/classroom` with the same course and status. |
| `course-overview` | Member | Open the course, show both sections with first lesson completed and the resume control. | Open `C/classroom/document-a-small-repair` at the corresponding resumed state. |
| `lesson-player` | Member | Resume at Take a wide photo. Show the lesson body and completion or next control. | Open the same lesson state in the existing player. |
| `course-outline-edit` | Admin | Open the course → Edit lessons. Show two sections and six lessons, with publication states. | Open `C/classroom/document-a-small-repair/edit` and show the outline. |
| `lesson-edit` | Admin | Hover Take a wide photo → Edit. Capture body, settings and save/preview controls. | Open the corresponding lesson in the course builder. |

Record resuming, completing the next lesson and opening the following one. Record editing a lesson and previewing before saving as admin. [Circle curriculum and editor entry](https://help.circle.so/p/courses/course-setup/building-a-course-curriculum)

### 07-members-profiles

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `member-directory` | Member | Header Member directory. Search Quiet Hinge and show the filtered row or card. | Open `C/members` and search the same name. |
| `member-profile` | Member | Open Quiet Hinge's full profile, with bio and available activity or rewards links. | Open the matching `/members/[id]`, then its Activity or Badges tab. |
| `leaderboard` | Member | Open the enabled header Leaderboard. Show position and explanation for the selected member. | Open the Hub member leaderboard from `/members` and show XP and the matching member's award or progress where seeded. |
| `audience-member-detail` | Admin | Admin → Audience, search Quiet Hinge, open their member record and show role/access affordances. | Open `C/settings/members`, filter to Quiet Hinge and show authorized role actions. |

Record finding Quiet Hinge's work and returning to the roster. Verify hidden profiles and identity protection separately. [Circle member navigation and profiles](https://help.circle.so/p/basics/getting-started/navigating-circle-on-desktop)

### 08-notifications-search

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `find-forum` | Member | Open Search from the header and find General discussion. | Open the header page finder on `C`, filter to Forum and follow the visible link. |
| `search-results` | Member | From Search, type drawer and show the matching discussion. | Search drawer in the existing `C/forum` search and open a mapped matching thread. |
| `search-empty` | Member | Change the query to qzxnohit and show the zero-results state. | Use the same query in Forum and show its empty state. |
| `unread-notification` | Member | Open header Notifications → Inbox with the seeded unread mention, then open its target. | Open the bell with the same mention and follow it to the source. |
| `notification-prefs` | Member | Open the user's notification settings and show available in-app and email toggles. | Open `D/settings` → notification preferences with the same categories where supported. |
| `moderation-inbox` | Admin | Admin Inbox → moderation controls with a fixture report, if available. | Follow the organizer notification to the same kind of community report and its authorized action. |

Record finding and opening A drawer that catches, then returning and opening the unread mention. Record mark-read behavior. [Circle search and inbox entry](https://help.circle.so/p/basics/getting-started/navigating-circle-on-desktop) · [Circle notifications](https://help.circle.so/p/members/account-access-management/access-your-notifications)

### 09-join-onboarding

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `invite-landing` | Visitor | Open a Workbench Notes invitation link in a signed-out browser. Capture the sign-up and existing-account affordance. | Open the equivalent `/invite/[token]` and show join/sign-in choices. |
| `verification-or-profile` | New member | Follow the invite through any code verification and the profile step, capturing each shown state. | Use `/auth/signup`, email verification and `D/onboarding`, capturing the equivalent steps. |
| `first-member-home` | New member | Accept and finish on Feed or the configured welcome space, with next action visible. | Open `C` after join with its current space links and the welcome checklist if configured. |
| `paywall-checkout` | Visitor | Open the fixture's paywall checkout URL and show the offer and next step. | Open `C/offers/[offerId]` with matching offer text and test checkout entry. |
| `invite-admin` | Admin | Admin → Audience → Invitation links and open the fixture link's access settings. | Open `C/settings/invites` and show the same link's intended role and limits. |

**Record `join`.** Open a fixture link, create or use the synthetic account, verify when prompted and complete onboarding. Show the member reaching the community home and opening an existing space. Record a returning existing-account path from the same logged-out starting point. Use sandbox checkout only where permitted. Record the paywall gate and AIT pending approval separately. [Circle onboarding](https://help.circle.so/p/audience/onboarding/guide-members-through-the-community-onboarding-process) · [Circle invitation links](https://help.circle.so/p/audience/onboarding/set-up-an-invitation-link)

### 10-admin-settings

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `general-settings` | Admin | Community name → Settings → Website → General. Show community identity and default controls. | Open `C/settings/general` with the matching structure and save state. |
| `spaces-admin` | Admin | Admin → Community → Spaces. Open Show your work's Edit space view. | Open `C/settings/spaces` and show the existing Surfaces and Rooms sections and Show your work controls. |
| `audience-admin` | Admin | Admin → Audience, search Blue Spool, open member actions. | Open `C/settings/members` with the same member selected. |
| `theme-preview` | Admin | Community menu → Customize theme. Preview a light and a dark appearance before saving. | From `C/settings/themes`, preview Plain and Night, then cancel. |
| `member-return` | Member | Open Home as a standard member and show the community menu without admin controls. | Open `C` as a member and show the same control state. In the parity run, also attempt a direct Settings URL. |

Record renaming a space, saving, and switching to the member view. Run the full AIT settings inventory in the parity gate. [Circle admin navigation](https://help.circle.so/p/basics/getting-started/navigating-circle-on-desktop) · [Circle theme customization](https://help.circle.so/c/core-features/how-can-i-customize-my-community-theme)

### 11-cross-community-discovery

Skool is the scored discovery reference. Circle also has an opt-in marketplace and a member switcher. Capture both as context. Do not publish a synthetic community to a live public marketplace for this exercise. Record real browse results where a reference marketplace cannot host the fixture, and compare the browse task with the same query or closest category. Use fixture data for membership switching in the controlled communities. [Skool discovery](https://www.skool.com/discovery) · [Skool listing rules](https://help.skool.com/article/153-discovery-faqs) · [Circle Discover](https://help.circle.so/p/basics/circle-discover/get-to-know-circle-discover)

| Screen | Viewer | Reference action and state | AIT action and state |
| --- | --- | --- | --- |
| `discovery-landing` | Visitor | Skool Discovery at its default listing. Circle Discover via the switcher icon or standalone site. | Open `/communities` signed out, with query and category options visible. |
| `discovery-results` | Visitor | Search repair in Skool Discovery and in Circle Discover. Capture results or the empty state as served. | Search repair in `/communities` with a fixture listing and ordinary empty-state coverage. |
| `community-front-door` | Visitor | Open one relevant Skool result's About page. Open a Circle Discover listing and its public destination where allowed. | Open the public Workbench Notes front door. Capture a listed-private variant separately with description and join only. |
| `return-to-community` | Member | Open the joined community switcher in Circle and switch back to Workbench Notes. In Skool show the return to an already joined community if available in the test account. | Open `D/communities` and the switcher, then return to `C` without another sign-in. |
| `discovery-controls` | Admin | Circle Discover creator page → listing setup or eligibility prompt. In Skool open the test group's Discovery controls if exposed. | Open `C/settings/general` and show directory visibility and join-policy options. |

Record browse → front door → join in the controlled workspace where supported, then return via the existing account. Verify the anonymous sitemap and noindex cases in AIT parity.

### 15-ait-extras

Use the same polished Circle post space in Feed layout for text/list/detail tasks, and one temporary Image space for the media craft baseline. Use the same text excerpt or neutral synthetic image wherever the reference surface can display it. Circle's admin actions in this section are craft references for equivalent screen types. The AIT route and role checks establish functional parity. [Circle post layout options](https://help.circle.so/p/posts/post-spaces/customize-post-space-settings) · [Circle Image space controls](https://help.circle.so/p/posts/image-spaces/customize-image-space-settings)

| Screen | Viewer | Circle action and state | AIT action and state |
| --- | --- | --- | --- |
| `magazine-reading-and-desk` | Member and editor | Open a pinned long-form post in General discussion and then its edit view as admin. | Open the magazine desk and its public issue/article, then the issue editor as editor. Capture public reading and editor as separate states. |
| `gallery-lightbox` | Member and admin | Open the Image space and a fixture image, then its space moderation menu as admin. | Open `C/gallery`, enter the same image lightbox, then show gallery review as admin. |
| `launchpad-ideas` | Member | Open a structured General discussion showcase post with replies and reactions, then return to the post list. | Open `C/launchpad` and its corresponding project detail, and `C/ideas` with a vote and status control. |
| `matching-offers` | Member and admin | Open the member directory filtered to one fixture member, then an open fixture paywall detail or preview as admin. | Open `C/match` as a member and admin, and `C/offers` with the offer detail. |
| `reels` | Member | Open the Image space and preview a media post or clip in the feed. | Open `C/reels` with the same neutral clip loaded and visible controls. |
| `rituals-referrals-insights` | Admin | Open the pinned recurring event or post, Audience → Invitation links, then Analytics → Overview. | Open `C/rituals`, `C/referrals` and `C/insights`, with meaningful work ready in each screen. |
| `hub-jobs-news-blog` | Member and author | Open the polished General discussion list, a linked-resource post and New post editor. | Use Hub navigation to open Jobs, News and Blog. Capture a job detail, news story and author workspace. |
| `agents-investigations` | Admin and member | Open the admin Agents list if available, then the most polished Circle resource post and related navigation. | Open `/agents`, `D/agent` and `/investigations`. Capture an investigation detail and a return to Hub. |
| `secondary-extras` | Signed-in member | Capture an organized Circle resource list and show its path back to Home. | Capture Sponsors, Startups, Roles and the Collector desk, with their path back to Hub or Account. |

For rows with several distinct views, append a short suffix to the screen ID on both sides, for example `magazine-reading-and-desk-editor`. Record entering an extra from the sidebar or Hub, taking one visible action and returning. The full item 15 route inventory still runs in parity, including authoring, moderation and redirects.

## Existing workflow recordings

Run on synthetic accounts and content. Record start and end, clicks or commands, elapsed time, errors, recovery and the final screen. Keep key material, invite grants and download links out of shared logs. Use the same data, task order and desktop and mobile viewports. Record the existing role or plan gate when it affects a task and mark unavailable steps in the comparison.

### 12-free-community-creation

**Task.** From a fresh account, create Workbench Sandbox through the current product UI, open an existing destination and share a member invite through the product's invitation controls.

1. **Circle.** Start from its current trial or community creation entry. Complete the available setup, open a usable destination, then use Audience → Invitation links to create and copy a member invite. Test the link in a second session. Capture the trial and billing state shown. [Circle trial and pricing](https://circle.so/pricing) · [Circle invite setup](https://help.circle.so/p/audience/onboarding/set-up-an-invitation-link)
2. **AIT.** Open `/communities` → Create community. Complete the existing dialog for Workbench Sandbox and record its default selections. Follow the success navigation to the new home, open a built-in space and create and copy a member invite from Settings → Invites. Test the link in a second session. Capture the `/communities?create=1` sign-in continuation and name conflict separately for parity.
3. **Record `create-community`.** Score how easily a person finds Create, understands the form, reaches the created community and finds the invite action. Record any trial or payment prerequisite shown.

### 13-builder-access

**Task.** Find and use the current key controls, connect an MCP client and set up and test a webhook using the product's documented flow.

1. **Circle.** Follow the current developer guide to create a test credential and run a supported read if the plan allows. Follow its MCP setup instructions and complete one documented operation. Use the existing Webhook action in Workflows to send a test to the recording fixture's receiver, where available. Capture any access or plan gate. [Circle API quick start](https://api.circle.so/apis/admin-api/quick-start) · [Circle webhook workflow](https://help.circle.so/p/workflows/workflow-setup/configure-automation-workflows-to-send-webhooks) · [Circle MCP setup](https://circle.so/blog/circle-mcp-use-cases)
2. **AIT.** As the owner of a synthetic claimed agent, open `D/agent` → Profile to generate an agent key. Use Connect and the existing setup guides to connect the client to `/api/mcp` and run an authorized read such as `get-community-info` for the fixture community. In Connect → Webhook, configure the test receiver and use Test. Record the returned status and receiver result. Exercise revocation, the existing agent-draft approval path and the Luma integration screen separately for parity.
3. **Record `builder-access`.** Score how quickly a person finds the controls and guides, uses the credential and client, and understands webhook feedback. Use each product's actual permissions and available operations.

### 14-existing-exports

**Task.** As an eligible organizer or owner, find an existing export, download it and identify what the file covers.

1. **Circle.** Open the fixture event's attendee management screen as organizer and use its export if available. If the trial or screen does not expose that action, capture the closest existing CSV workflow, Audience → More → Export CSV. Record the entry point, scope and download or delivery state. [Circle attendee management](https://help.circle.so/p/live-and-events/events/add-members-to-an-event) · [Circle member CSV](https://help.circle.so/p/administration/analytics/export-a-csv-of-your-members)
2. **AIT.** Open `C/events/[eventSlug]/attendees` as organizer and download the CSV. Use the existing attendee filters and compare the file with the visible roster. In parity, download the owner-only payments CSV from Settings → Payments and both formats from a completed collector run, and check the other file actions in item 14's inventory.
3. **Record `export-download`.** Score discoverability, clarity of format and scope, and how the UI communicates the result. Record the actual dataset and eligibility for each product.
