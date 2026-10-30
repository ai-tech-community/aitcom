# Homepage discovery design

Approved direction: community-led discovery, confirmed by Greg on 2026-10-28.

Keep the existing AIT typography, white/dark surfaces, orange accents, house section labels, navigation and town-square identity. Shorten the hero. Below the stats, show up to six eligible communities in compact cards (two columns on phones, three on wide screens when there are more than four communities) beside four news items in an 8/4 desktop split. Use real logos and short decorative ASCII scenes rather than large repeated illustrations. Retain the curated communities first, filling from listed communities; never expose unlisted communities except the existing Hub. Known excluded test communities must never appear.

Keep the upcoming-events agenda with real dates, locations, hosts and direct event links. Add a magazine shelf of the latest published, anonymously readable issue per magazine, at most four, reusing the magazine access predicates, card presentation and cover art. Uploaded covers retain their aspect ratio; missing covers use a typographic masthead and issue title. Hide the shelf when nothing is published; do not invent issues or covers. Issue links preserve teaser access where applicable.

Mobile reading and keyboard order: communities, events, news, magazines. Desktop communities and news align at the top; events span below both. Missing communities or news must not leave an empty column. Use DOM order matching mobile reading order and CSS grid placement for desktop.

Remove repeated start-here and what-we-do pitches from this homepage composition. Retain nonempty recent gatherings and sponsors as evidence, ending with a compact organizer prompt linking to the existing create-community flow. Preserve components used by other surfaces.

Fetch only through existing read paths. No database writes, migrations, pushes, full tests, integration tiers or Chromium test tiers. Verify touched unit tests, workspace typecheck, localization parity, and desktop/mobile render snapshots using synthetic fixture data if a live app cannot be safely rendered.

## Implemented composition

`src/app/[locale]/page.tsx` keeps the town-square hero and stats, then delegates discovery to `HomeSections`. The route uses `force-dynamic` so listing and magazine visibility changes apply on the next request. The shorter hero and compact organizer close retain the existing visual identity; the repeated marketing sections are absent from this composition.

`HomeSections` renders communities, events, news and magazines in DOM order. At `lg`, communities and news occupy eight and four grid columns respectively, with events spanning the next row; either discovery section fills the row when its peer is absent. Community cards stay in two columns until `xl`, where five or six cards use three columns. Decorative ASCII strips are 64px high on phones and 96px from `sm`, with `minRows={4}` so the phone artwork actually renders.

`HomeMagazines` shows at most four entries from the existing anonymous magazine reading model, each linking directly to its newest eligible issue under the existing public/teaser rules. Uploaded artwork uses `IssueCoverArt`; missing artwork uses a typographic cover. Empty magazines, recent gatherings and sponsors are omitted. The organizer action links to the existing create-community flow.

## Verification

All 51 focused tests across the five touched/new test files passed. Workspace `pnpm typecheck` and targeted ESLint passed after the final code review corrections. English and Dutch catalogs have matching keys (4,909 each after rebasing onto current main).

Desktop and mobile snapshots in `.impeccable/review/desktop.png` and `.impeccable/review/mobile.png` exercise the running React components with synthetic content; the review reported no console errors. Review disposition is resolved/ship for the task's fix list, including the mobile artwork correction. These snapshots verify composition, not live production content or database behavior.

### Final code review corrections

The homepage magazine shelf now reads at most forty recent discoverable issues using card fields only, then at most four distinct magazines. It reuses the anonymous read scope, hidden-magazine filter and issue-card access resolver; the full magazine directory loader is unchanged. If one magazine dominates that recent window, the shelf may show fewer than four magazines. This bounded discovery shelf is supplementary; the full directory remains available from its link.

Magazine-loading errors are logged and produce an empty shelf without taking down the homepage. Focused tests cover query bounds, newest-issue deduplication, hidden and restricted rows, confirmed teaser access, empty data and query failure. The homepage composition test now includes a populated magazine shelf in the complete mobile reading order.

The final code reviewer confirmed both magazine-loading findings resolved with no new actionable findings in the correction scope. The workspace type-check passed after that correction.

Before the local merge, the homepage commit rebased cleanly onto `origin/main` at `a4228782`. All 51 focused tests, targeted ESLint and translation parity passed on that base.
